"use strict";

const consoleFont = require("./consoleFont");
const Server = require("./server");

let port;
if (process.argv.length > 3) {
    if (process.argv[2].trim().toLowerCase() === "-port") {
        port = Number.parseInt(process.argv[3]);
        if (typeof(port) === "number" && (port <= 0 || port >= 65536)) {
            console.log(`${consoleFont.BACKGROUND_RED}Error! The server port should be: 0 > port < 65536${consoleFont.DEFAULT}`);
            return;
        }
    }
}

if (port > 0) {
    new Server(port).listen();
} else {
    console.log(`You must to define a server port number like: '${consoleFont.FOREGROUND_CYAN}node main.js -port <port_number>${consoleFont.DEFAULT}'`);
}
