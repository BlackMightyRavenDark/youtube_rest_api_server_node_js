"use strict";

const consoleFont = require("./consoleFont");
const path = require("node:path");
const fs = require('node:fs');
const fsPromises = require("node:fs/promises");
const zlib = require("node:zlib");

class Utils {
    static get YOUTUBE_URL() { return "https://www.youtube.com"; }
    static get API_PLAYER_ENDPOINT_URL() { return `${Utils.YOUTUBE_URL}/youtubei/v1/player`; }
    static get WEB_UI_DIRECTORY() { return "web_ui"; }

    static answerClient(client, statusCode, headers, message, acceptEncoding) {
        const realHeaders = headers || {};
        const isBuffer = message?.constructor.name === "Buffer";
        if (typeof(message) === "object" && !isBuffer) { message = JSON.stringify(message); }
        if (typeof(message) === "string" && message.length > 0 &&
            ((message[0] === "{" && message[message.length - 1] === "}") ||
            (message[0] === "[" && message[message.length - 1] === "]"))) {
            realHeaders["Content-Type"] = "application/json";
        }

        const code = statusCode < 100 ? 500 : statusCode;
        const useCompression = acceptEncoding?.includes("gzip");
        const realMessage = code >= 100 && message?.length > 0 ?
            (useCompression ? zlib.gzipSync(message) : (isBuffer ? message : Buffer.from(message))) : null;
        if (realMessage?.length > 0) {
            realHeaders["Content-Length"] = realMessage.length.toString();
            if (useCompression) { realHeaders["Content-Encoding"] = "gzip"; }
        }

        client.writeHead(code, realHeaders);
        if (realMessage?.length > 0) { client.write(realMessage); }
    }

    static async downloadString(url, headers, cookies) {
        try {
            const realHeaders = headers || {};
            if (cookies) {
                const filteredCookies = Utils.filterDomainCookies(cookies, url);
                if (filteredCookies) {
                    const cookieHeaderValue = Utils.formatCookieHeaderValue(filteredCookies);
                    if (cookieHeaderValue) {
                        realHeaders.cookie = cookieHeaderValue;
                    }
                }
            }

            const response = await fetch(url, { "headers": realHeaders });
            return [response.status, response.statusText, await response.text(), response.headers];
        } catch (e) {
            return [-1, e.message, e];
        }
    }

    static async downloadYouTubeClientConfiguratiom(client, videoId, cookies) {
        const urls = {
            "web_embedded": `https://www.youtube.com/embed/${videoId}?html5=1`,
            "tv_html5": "https://www.youtube.com/tv"
        };
        const headers = { };
        if (client.userAgentYtcfg) { headers["User-Agent"] = client.userAgentYtcfg; }
        else if (client.userAgent) { headers["User-Agent"] = client.userAgent; }
        const response = await Utils.downloadString(urls[client.id], headers, cookies);
        if (response[0] == 200) {
            const ytcfg = Utils.extractYoutubeConfigFromWebPageCode(response[2]);
            return [ytcfg ? 200 : 400, ytcfg];
        }

        return [response[0], response[1]];
    }

    static extractCipherDeryptionFunctionCode(playerCode) {
        const globalVariable = Utils.extractGlobalVariableFromPlayerCode(playerCode);
        if (globalVariable) {
            const algorithm = Utils.extractCipherDeryptionAlgorithm(playerCode);
            if (algorithm) {
                const part2name = algorithm[1].match(new RegExp(`function\\(.{1,3}\\).{1,20};(?<name>.{1,6})\\[${globalVariable.name}\\[`));
                if (part2name?.groups?.name) {
                    const escapedFunctionName = part2name.groups.name.replaceAll("$", "\\$");
                    const part2code = playerCode.match(new RegExp(`(?:const|let|var) ${escapedFunctionName}=.{1,1000}}};`, "s"));
                    if (part2code?.length > 0) {
                        const code = `${globalVariable.code};\r\n${part2code[0]}\r\nconst ${algorithm[0]}=${algorithm[1]}\r\n`;
                        return [code, algorithm[0]];
                    }
                }
            }
        }
    }

    static extractCipherDeryptionAlgorithm(playerCode) {
        const name = /=(.{1,3})\(decodeURIComponent/s.exec(playerCode);
        if (name?.length > 1) {
            const m = playerCode.match(new RegExp(`${name[1]}=(function.{1,1000}};)`));
            if (m) { return [name[1], m[1]]; }
        }
    }

    static extractGlobalVariableFromPlayerCode(playerCode) {
        const m = playerCode?.match(/'use strict';(?<code>(?:const|var|let) (?<name>\w{1,3})=.{100,3000}(?:"\]|\.split\("."\)))(?:,|;)/s);
        return m?.groups;
    }

    static extractNFunctionCode(playerCode, globalVariable, nParameterValue) {
        const regExp = new RegExp(`function\\(\\w{1,3}\\){var \\w{1,3}=.{100,6000}new Date.{100,6000}${globalVariable.name}\\[\\d{1,3}\\]\\)};`, "s");
        const m = regExp.exec(playerCode);
        if (m) {
            if (nParameterValue) {
                const preparedCode = Utils.prepareNFunctionCode(m[0], globalVariable, nParameterValue);
                return preparedCode;
            }

            return m[0];
        }
    }

    static extractPlayerResponseFromWebPageCode(webPageCode) {
        const m = webPageCode?.match(/ytInitialPlayerResponse = (?<ok>\{".*\}{1,7});(?:(?:const|var|let)|\<\/script)/)?.groups?.ok;
        return m ? JSON.parse(m) : null;
    }

    static extractPlayerUrlFromYouTubeConfig(ytcfg) {
        if (ytcfg && typeof(ytcfg) !== "string") { ytcfg = JSON.stringify(ytcfg); }
        const jsUrl = ytcfg?.match(/"jsUrl":\s*"(?<ok>.*?)"/)?.groups?.ok;
        if (jsUrl) {
            return Utils.YOUTUBE_URL + jsUrl;
        }
    }

    static extractSignatureTimestampFromPlayerCode(playerCode) {
        return playerCode.match(/signatureTimestamp\s*:\s*(?<sts>[0-9]*)/)?.groups?.sts;
    }

    static extractThumbnailList(rawVideoInfo) {
        const microformatThumbnails = rawVideoInfo.microformat?.playerMicroformatRenderer?.thumbnail?.thumbnails?.filter(() => true).sort((a, b) => b.height - a.height);
        const videoDetailsThumbnails = rawVideoInfo.videoDetails?.thumbnail?.thumbnails?.filter(() => true).sort((a, b) => b.height - a.height);

        const thumbnails = [];
        if (videoDetailsThumbnails) {
            videoDetailsThumbnails.forEach(element => thumbnails.push(element));
            if (thumbnails[0].height === 1080 && thumbnails[0].url.includes("maxres")) {
                thumbnails[0].width = 1280;
                thumbnails[0].height = 720;
            }
        }

        if (microformatThumbnails) {
            microformatThumbnails.forEach(element => {
                if (!thumbnails.find(item => item.url === element.url)) {
                    thumbnails.splice(0, 0, {
                        "url": element.url,
                        "width": element.width,
                        "height": element.height
                    });
                }
            });
        }

        if (thumbnails.length > 0) {
            for (let i = 0; i < thumbnails.length; ++i) {
                if (thumbnails[i].url.includes("webp")) {
                    thumbnails.splice(0, 0, {
                        "width": sorted[i].width,
                        "height": sorted[i].height,
                        "url": sorted[i].url.replace("vi_webp", "vi").replace(".webp", ".jpg")
                    });
                    break;
                }
            }

            if (thumbnails[0].url.includes("?")) {
                thumbnails.splice(0, 0, {
                    "url": thumbnails[0].url.substring(0, thumbnails[0].url.indexOf("?")),
                    "width": thumbnails[0].width,
                    "height": thumbnails[0].height
                });
            }
        }

        return thumbnails;
    }

    static extractYoutubeConfigFromWebPageCode(webPageCode) {
        const m = webPageCode?.match(/ytcfg\.set\((?<ok>.*"}+)\)/m)?.groups?.ok;
        return m ? JSON.parse(m) : null;
    }

    static filterDomainCookies(cookies, url) {
        if (cookies) {
            const urlObj = new URL(url);
            const domain = urlObj.host.startsWith("www.") ? urlObj.host.substring(4, urlObj.host.length - 1) : urlObj.host;

            const set = new Set();
            return cookies.filter(cookie => {
                if (cookie.domain.includes(domain) && !set.has(cookie.name)) {
                    set.add(cookie.name);
                    return true;
                }
            });
        }
    }

    static findNFunctionParameterName(nFunctionCode) {
        const m = /function\((\w{1,3})\)/.exec(nFunctionCode);
        return m?.length > 1 ? m[1] : null;
    }

    static fixNFunctionCode(nFunctionCode, funcParameterName) {
        const regExp = new RegExp(`if\\(typeof .{6,20}\\)return ${funcParameterName};`)
        const replaced = nFunctionCode.replace(regExp, "");
        return replaced ?? nFunctionCode;
    }

    static formatCookieHeaderValue(cookies) {
        const reduced = cookies?.reduce((r, v) => `${r}${v.name}=${v.value}; `, "");
        return reduced?.length > 3 ? reduced.substring(0, reduced.length - 2) : null;
    }

    static formatDateTime(date) {
        const h = date.getUTCHours().toString();
        const m = date.getUTCMinutes().toString();
        const s = date.getUTCSeconds().toString();
        return `${date.getUTCFullYear()}-${(date.getUTCMonth() + 1).toString().padStart(2, "0")}-${date.getUTCDate().toString().padStart(2, "0")} ` +
            `${h.padStart(2, "0")}:${m.padStart(2, "0")}:${s.padStart(2, "0")}.${date.getUTCMilliseconds().toString().padStart(4, "0")} GMT`;
    }

    static async getAdditionalData(videoId, webPageCode, getPlayerCode, headers, cookies) {
        if (!webPageCode && videoId) {
            const videoUrl = Utils.getYouTubeVideoUrl(videoId);
            const response = await Utils.downloadString(videoUrl, headers, cookies);
            if (response[0] === 200) {
                webPageCode = response[2];
            }
        }

        if (webPageCode) {
            const ytcfg = Utils.extractYoutubeConfigFromWebPageCode(webPageCode);
            const playerUrl = ytcfg ? Utils.extractPlayerUrlFromYouTubeConfig(ytcfg) : null;
            if (playerUrl) {
                if (getPlayerCode) {
                    const response = await Utils.downloadString(playerUrl, headers, cookies);
                    if (response[0] === 200) {
                        return [webPageCode, ytcfg, response[2], playerUrl];
                    }
                } else {
                    return [webPageCode, ytcfg, null, playerUrl];
                }
            }

            return [webPageCode, ytcfg, null, playerUrl];
        }

        return [null, null, null, null];
    }

    static getCookie(cookies, name) {
        for (let i = 0; i < cookies.length; ++i) {
            if (cookies[i].name === name) {
                return cookies[i];
            }
        }
    }

    static getSetFromParameters(parameters) {
        const splitted = parameters.replaceAll(" ", "").split(",");
        const set = new Set();
        splitted.forEach(s => {
            if (s && !set.has(s)) { set.add(s); }
        });
        return set;
    }

    static async getUrlsDecryptionData(videoId, videoWebPage, headers, cookies) {
        if (!videoWebPage) {
            const videoUrl = Utils.getYouTubeVideoUrl(videoId);
            const responseVideoWebPage = await Utils.downloadString(videoUrl, headers, cookies);
            if (responseVideoWebPage[0] === 200) {
                webPageCode = responseVideoWebPage[2];
            }
        }

        const playerData = await Utils.getPlayerData(videoId, webPageCode, true, headers, cookies);
        return [playerData[0], playerData[1], playerData[2], playerData[3]];
    }

    static getSocketAddress(socket) {
        return `${socket?.remoteAddress}:${socket?.remotePort}`;
    }

    static getValidRequestParameterSet() {
        return new Set(["web_page", "raw_video_info", "parsed_video_info", "urls", "all"]);
    }

    static getYouTubeClientList() {
        return [
            {
                "display_name": "Automatic",
                "id": "auto",
                "supports_cookies": true
            },
            {
                "display_name": "TV HTML5",
                "id": "tv_html5",
                "supports_cookies": true
            },
            {
                "display_name": "WEB EMBEDDED",
                "id": "web_embedded",
                "supports_cookies": false
            }
        ]
    }

    static getYouTubeVideoUrl(videoId) {
        return `${Utils.YOUTUBE_URL}/watch?v=${videoId}`;
    }

    static logToConsole(message, isError) {
        const date = new Date();
        const f = isError ? console.error : console.log;
        const msg = isError ? `${consoleFont.BACKGROUND_RED}${message}${consoleFont.DEFAULT}` : message;
        f(`${Utils.formatDateTime(date)}> ${msg}`);
    }

    static prepareNFunctionCode(nFunctionCode, globalVariable, nParameterValue) {
        const parameterName = Utils.findNFunctionParameterName(nFunctionCode);
        if (parameterName) {
            const fixedCode = Utils.fixNFunctionCode(nFunctionCode, parameterName);
            const funcName = "decrypt";
            return `${globalVariable.code}\r\nconst ${funcName}=${fixedCode}\r\n${funcName}("${nParameterValue}");`;
        }
    }

    static searchRegularExpression(regularExpressionArray, inputString) {
        for (let i = 0; i < regularExpressionArray.length; ++i) {
            const m = regularExpressionArray[i].exec(inputString);
            if (m) { return m; }
        }
    }

    static async sendFile(client, filePath, fileStats, acceptEncodingHeaderValue) {
        if (!fileStats) { fileStats = fs.statSync(filePath); }
        if (fileStats) {
            let compressible;
            const headers = { "Content-Length": fileStats.size.toString() };
            const ext = path.extname(filePath)?.toLowerCase();
            if (ext) {
                switch (ext) {
                    case ".css":
                        headers["Content-Type"] = "text/css";
                        compressible = true;
                        break;

                        case ".html":
                        headers["Content-Type"] = "text/html";
                        compressible = true;
                        break;

                    case ".js":
                        headers["Content-Type"] = "application/javascript";
                        compressible = true;
                        break;

                    case ".png":
                        headers["Content-Type"] = "image/png";
                        break;
                }
            }

            const buffer = await fsPromises.readFile(filePath);
            Utils.answerClient(client[1], buffer ? 200 : 500, headers, buffer, compressible ? acceptEncodingHeaderValue : null);
        }
    }

    static tryParseJson(jsonString) {
        try {
            return JSON.parse(jsonString);
        } catch {
            return null;
        }
    }
}

module.exports = Utils;
