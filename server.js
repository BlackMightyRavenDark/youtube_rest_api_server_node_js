"use strict";

const Clients = require("./clients");
const consoleFont = require("./consoleFont");
const fs = require('node:fs');
const http = require("node:http");
const Utils = require("./utils");
const querystring = require("node:querystring");

class Server {
    #isListening = false;

    constructor(port) {
        this.port = port;
    }

    listen() {
        if (this.#isListening) { Utils.logToConsole(`${consoleFont.BACKGROUND_BRIGHT_RED}The server is already listening!${consoleFont.DEFAULT}`); }

        this.#isListening = true;
        const serverSocket = http.createServer((request, response) => {
            const date = new Date();
            const socketAddress = Utils.getSocketAddress(request.socket);
            Utils.logToConsole(`Client ${consoleFont.FOREGROUND_BRIGHT_WHITE}${socketAddress}${consoleFont.DEFAULT} is connected`);

            const buffer = [];

            request.on("data", chunk => buffer.push(chunk));
            request.on("end", async () => {
                const hasBody = request.method === "POST" || request.method === "PUT";
                const receivedData = hasBody ? Buffer.concat(buffer) : null;
                const receivedRequest = {
                    "date": date,
                    "client_address": socketAddress,
                    "method" : request.method,
                    "headers": request.headers,
                    "path": request.url,
                    "body": hasBody ? receivedData.toString() : ""
                }

                await this.#processClient([request, response, socketAddress], receivedRequest);
                response.end();

                Utils.logToConsole(`Client ${socketAddress} is disconnected`);
            });
            request.on("error", e => Utils.logToConsole(e, true));
        });
        serverSocket.listen(this.port, () => Utils.logToConsole(`The server is started on port ${this.port}`));
    }

    async #processGetVideoInfo(client, queryString, headers, cookies) {
        const query = querystring.parse(queryString);

        const videoId = query["video_id"];
        if (!videoId) {
            Utils.answerClient(client[1], 400, null,
                "The 'video_id' parameter wasn't sent!");
            return;
        }

        const apiClientName = query["api_client_name"] ?? "auto";

        const config = {
            "requestedData": query["requested_data"] || "all",
            "acceptEncoding": headers["accept-encoding"]
        };

        await Clients.getVideoInfo(videoId, apiClientName, config, cookies, client);
    }

    async #processWebUi(client, parsedRequest) {
        const requestedPath = parsedRequest.path.trimEnd();
        const filePath = requestedPath === "/web_ui" || requestedPath === "/web_ui/" ||
            requestedPath.startsWith("/web_ui?") ? `${Utils.WEB_UI_DIRECTORY}/index.html` : requestedPath.substring(1);
        if (filePath === `${Utils.WEB_UI_DIRECTORY}/index.html`) {
            Utils.logToConsole(`[${consoleFont.FOREGROUND_CYAN}WEB UI${consoleFont.DEFAULT}]: The client ${client[2]} is requested WEB UI base page`);
        }

        if (!fs.existsSync(filePath)) {
            const t = `File '${filePath}' not found!`;
            Utils.logToConsole(t, true);
            Utils.answerClient(client[1], 404, null, t);
            return;
        }

        const fileStats = fs.statSync(filePath);
        const subPath = filePath.substring(Utils.WEB_UI_DIRECTORY.length);
        Utils.logToConsole(`[${consoleFont.FOREGROUND_CYAN}WEB UI${consoleFont.DEFAULT}]: Sending file ` +
            `'${consoleFont.FOREGROUND_ORANGE}${subPath}${consoleFont.DEFAULT}' (${fileStats.size} bytes) to client ${client[2]}`);
        await Utils.sendFile(client, filePath, fileStats, parsedRequest.headers["accept-encoding"]);
    }

    async #processClient(client, parsedRequest) {
        Utils.logToConsole(`Client ${client[2]} sent: ${parsedRequest.method} ${parsedRequest.path}`);
        if (parsedRequest.method === "GET" && parsedRequest.path.startsWith("/web_ui")) {
            await this.#processWebUi(client, parsedRequest);
            return;
        }

        const requestedPathSplitted = parsedRequest.path.split("?");
        const requestedEndpoint = requestedPathSplitted[0];
        switch (parsedRequest.method) {
            case "GET":
                if (requestedPathSplitted.length > 0) {
                    switch (requestedEndpoint) {
                        case "/api/get_video_info":
                            await this.#processGetVideoInfo(client, requestedPathSplitted[1], parsedRequest.headers);
                            return;

                        case "/api/get_yt_client_list":
                            Utils.logToConsole(`Sending YouTube client list to ${client[2]}...`);
                            Utils.answerClient(client[1], 200, null, Utils.getYouTubeClientList());
                            return;
                    }
                }
                break;

            case "POST":
                switch (requestedEndpoint) {
                    case "/api/get_video_info":
                        const bodyParsed = Utils.tryParseJson(parsedRequest.body);
                        if (!bodyParsed) {
                            Utils.answerClient(client[1], 500, null, "Unable to parse body");
                            return;
                        }

                        const query = new URLSearchParams();
                        query.append("video_id", bodyParsed.video_id);
                        query.append("api_client_name", bodyParsed.api_client_name || "auto");
                        query.append("requested_data", bodyParsed.requested_data || "all");

                        const cookieArray = bodyParsed.cookies?.filter(() => true);

                        await this.#processGetVideoInfo(client, query.toString(), parsedRequest.headers, cookieArray);
                        return;
                }
                break;

            case "PUT":
                switch (requestedEndpoint) {
                    case "/api/default_cookies":
                        const bodyParsed = Utils.tryParseJson(parsedRequest.body);
                        if (!bodyParsed) {
                            Utils.answerClient(client[1], 500, null, "Unable to parse body");
                            return;
                        }

                        if (!bodyParsed.cookies || bodyParsed.cookies.length == 0) {
                            Utils.answerClient(client[1], 400, null, "No cookie sent");
                            return;
                        }

                        Utils.defaultCookies = bodyParsed.cookies;
                        Utils.logToConsole(`${consoleFont.FOREGROUND_ORANGE}Client ${client[2]} set ${Utils.defaultCookies.length} default cookies${consoleFont.DEFAULT}`);
                        Utils.answerClient(client[1], 200, null, "Default cookies accepted");
                        return;
                }
                break;

            case "DELETE":
                switch (requestedEndpoint) {
                    case "/api/default_cookies":
                        Utils.defaultCookies = null;
                        Utils.logToConsole(`${consoleFont.FOREGROUND_ORANGE}Client ${client[2]} has cleared all default cookies${consoleFont.DEFAULT}`);
                        Utils.answerClient(client[1], 200, null, "Default cookies cleared");
                        return;
                }
                break;
        }

        Utils.logToConsole(`Client ${client[2]} last request is rejected!`, true);
        if (!parsedRequest.path || parsedRequest.path === "/") {
            Utils.logToConsole(`Sending help message to client ${client[2]}...`);
            Utils.answerClient(client[1], 400, null,
                `Wrong request! To use this server, navigate to 'GET /web_ui'`);
        } else {
            Utils.answerClient(client[1], 400, null, "Wrong request!");
        }
    }
}

module.exports = Server;
