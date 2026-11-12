import Foundation
import Network

/// A loopback-only handoff to the configured Savers browser. Screenshots
/// remain in Application Support until the browser confirms it saved them.
final class CaptureBridge {
    static let port: UInt16 = 57733
    private let listener: NWListener
    private let queue = DispatchQueue(label: "app.savers.capture.bridge")
    private let directory: URL
    let token: String
    var baseURL: String
    var onAcknowledged: (() -> Void)?

    init(baseURL: String) throws {
        self.baseURL = baseURL
        let defaults = UserDefaults.standard
        // Keep the existing preferences key so installed apps stay paired.
        if let saved = defaults.string(forKey: "rebuildBridgeToken") {
            token = saved
        } else {
            token = UUID().uuidString + UUID().uuidString
            defaults.set(token, forKey: "rebuildBridgeToken")
        }
        directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Savers Capture/Queued Screenshots", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: Self.port)!)
        listener = try NWListener(using: parameters)
        listener.newConnectionHandler = { [weak self] connection in self?.receive(connection) }
        listener.start(queue: queue)
    }

    func enqueue(_ image: Data, title: String) throws {
        let id = UUID().uuidString
        let titleFile = directory.appendingPathComponent("\(id).txt")
        try title.write(to: titleFile, atomically: true, encoding: .utf8)
        do {
            try image.write(to: directory.appendingPathComponent("\(id).png"), options: .atomic)
        } catch {
            try? FileManager.default.removeItem(at: titleFile)
            throw error
        }
    }

    private func receive(_ connection: NWConnection, accumulated: Data = Data()) {
        connection.start(queue: queue)
        readHeader(connection, accumulated: accumulated)
    }

    private func readHeader(_ connection: NWConnection, accumulated: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16384) { [weak self] data, _, isComplete, error in
            guard let self else { connection.cancel(); return }
            var request = accumulated
            if let data { request.append(data) }
            guard request.count <= 16384, error == nil else { connection.cancel(); return }
            if let range = request.range(of: Data("\r\n\r\n".utf8)) {
                self.handle(connection, header: request.subdata(in: 0..<range.lowerBound))
            } else if isComplete {
                connection.cancel()
            } else {
                self.readHeader(connection, accumulated: request)
            }
        }
    }

    private func handle(_ connection: NWConnection, header: Data) {
        guard let raw = String(data: header, encoding: .utf8) else { connection.cancel(); return }
        let lines = raw.components(separatedBy: "\r\n")
        let request = (lines.first ?? "").components(separatedBy: " ")
        guard request.count >= 2 else { connection.cancel(); return }
        var fields: [String: String] = [:]
        for line in lines.dropFirst() {
            if let colon = line.firstIndex(of: ":") {
                fields[String(line[..<colon]).lowercased()] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
            }
        }
        guard fields["host"] == "127.0.0.1:\(Self.port)",
              fields["origin"] == URL(string: baseURL)?.origin else {
            respond(connection, status: "403 Forbidden", body: Data())
            return
        }
        if request[0] == "OPTIONS" {
            respond(connection, status: "204 No Content", body: Data())
            return
        }
        guard fields["authorization"] == "Bearer \(token)" else {
            respond(connection, status: "401 Unauthorized", body: Data())
            return
        }
        if request[0] == "GET" && request[1] == "/capture" {
            let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.creationDateKey])) ?? []
            guard let file = files.filter({ $0.pathExtension == "png" })
                .sorted(by: { ((try? $0.resourceValues(forKeys: [.creationDateKey]))?.creationDate ?? .distantPast) < ((try? $1.resourceValues(forKeys: [.creationDateKey]))?.creationDate ?? .distantPast) }).first,
                  let image = try? Data(contentsOf: file) else {
                respond(connection, status: "204 No Content", body: Data())
                return
            }
            let titleFile = file.deletingPathExtension().appendingPathExtension("txt")
            let title = (try? String(contentsOf: titleFile, encoding: .utf8)) ?? "Screenshot"
            let body = (try? JSONSerialization.data(withJSONObject: [
                "id": file.deletingPathExtension().lastPathComponent,
                "image": "data:image/png;base64,\(image.base64EncodedString())",
                "title": title,
            ])) ?? Data()
            respond(connection, status: "200 OK", body: body)
            return
        }
        if request[0] == "POST", request[1].hasPrefix("/ack/") {
            let id = String(request[1].dropFirst(5))
            guard UUID(uuidString: id) != nil else { respond(connection, status: "400 Bad Request", body: Data()); return }
            let file = directory.appendingPathComponent("\(id).png")
            if FileManager.default.fileExists(atPath: file.path) {
                try? FileManager.default.removeItem(at: file)
                try? FileManager.default.removeItem(at: directory.appendingPathComponent("\(id).txt"))
                onAcknowledged?()
            }
            respond(connection, status: "204 No Content", body: Data())
            return
        }
        respond(connection, status: "404 Not Found", body: Data())
    }

    private func respond(_ connection: NWConnection, status: String, body: Data) {
        let origin = URL(string: baseURL)?.origin ?? ""
        let headers = "HTTP/1.1 \(status)\r\nAccess-Control-Allow-Origin: \(origin)\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Authorization, Content-Type\r\nAccess-Control-Allow-Private-Network: true\r\nCache-Control: no-store\r\nContent-Type: application/json\r\nContent-Length: \(body.count)\r\nConnection: close\r\n\r\n"
        var response = Data(headers.utf8)
        response.append(body)
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }
}

private extension URL {
    var origin: String { "\(scheme ?? "https")://\(host ?? "")\(port.map { ":\($0)" } ?? "")" }
}
