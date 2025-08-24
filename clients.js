"use strict";

const consoleFont = require("./consoleFont");
const crypto = require("node:crypto");
const Parser = require("./parser");
const Utils = require("./utils");

class Clients {
    static async getVideoInfo(videoId, apiClientName, config, cookies, client) {
        Utils.logToConsole(`Client ${client[2]} is requested video '${consoleFont.FOREGROUND_GREEN}${videoId}${consoleFont.DEFAULT}'`);
        if (!apiClientName || typeof(apiClientName) !== "string") { apiClientName = "auto"; }

        const innertubeClient = {
            "userAgentWebPage": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:139.0) Gecko/20100101 Firefox/139.0"
        };

        switch (apiClientName) {
            case "auto":
            case "tv_html5":
                innertubeClient.id = "tv_html5";
                innertubeClient.nameInHeaders = "7";
                innertubeClient.userAgent = "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/25.lts.30.1034943-gold (unlike Gecko), Unknown_TV_Unknown_0/Unknown (Unknown, Unknown)";
                innertubeClient.userAgentYtcfg = "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version";
                innertubeClient.supportsCookies = true;
                break;

            case "web_embedded":
                innertubeClient.id = "web_embedded";
                innertubeClient.userAgent = "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/25.lts.30.1034943-gold (unlike Gecko), Unknown_TV_Unknown_0/Unknown (Unknown, Unknown)";
                innertubeClient.userAgentYtcfg = "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version";
                innertubeClient.nameInHeaders = "56";
                innertubeClient.supportsCookies = false;
                break;

            default:
                Utils.answerClient(client[1], 500, null, `YouTube client '${apiClientName}' not found!`);
                return;
        }

        if (innertubeClient.id) {
            const infoResponse = await this.#getVideoInfoViaClient(innertubeClient, videoId, config, cookies);
            Utils.logToConsole(`[${consoleFont.FOREGROUND_GREEN}${videoId}${consoleFont.DEFAULT}]: Sending response to ${client[2]}...`);
            Utils.answerClient(client[1], infoResponse.error_code, null, infoResponse, config.acceptEncoding);
        }
    }

    static async #getVideoInfoViaClient(client, videoId, config, cookies) {
        if (cookies?.length > 0) {
            Utils.logToConsole(`[${consoleFont.FOREGROUND_BRIGHT_WHITE}${videoId}${consoleFont.DEFAULT}]: Passed ${cookies.length} cookies`);
            if (!client.supportsCookies) {
                Utils.logToConsole(`[${consoleFont.FOREGROUND_BRIGHT_WHITE}${videoId}${consoleFont.DEFAULT}]: Client '${client.id}' does not support cookies`);
                return {
                    "error_code": 400,
                    "error_message": "Client does not support cookies",
                    "client_id": client.id
                }
            }
        }

        const requestedDataSet = Utils.getSetFromParameters(config.requestedData);
        if (requestedDataSet.size <= 0) { requestedDataSet.add("all"); }

        const validDataSet = Utils.getValidRequestParameterSet();
        for (const value of requestedDataSet) {
            if (!validDataSet.has(value)) {
                const message = `Wrong 'requested_data' value: '${value}'`;
                Utils.logToConsole(`[${videoId}]: ${message}`, true);
                return {
                    "error_code": 400,
                    "error_message": message
                };
            }
        }

        const videoWebPageUrl = Utils.getYouTubeVideoUrl(videoId);
        const filteredCookies = Utils.filterDomainCookies(cookies, videoWebPageUrl);
        const cookieHeaderValue = client.supportsCookies && cookies?.length > 0 ? Utils.formatCookieHeaderValue(filteredCookies) : null;

        Utils.logToConsole(`[${consoleFont.FOREGROUND_GREEN}${videoId}${consoleFont.DEFAULT}]: Downloading video webpage and gathering additional data...`);
        const videoWebPageHeaders = {
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Host": "www.youtube.com",
            "User-Agent": client.userAgentWebPage
        };
        if (cookieHeaderValue) { videoWebPageHeaders["cookie"] = cookieHeaderValue; }

        const getUrls = requestedDataSet.has("urls") || requestedDataSet.has("all");
        const playerData = await Utils.getAdditionalData(videoId, null, getUrls, videoWebPageHeaders, cookies);
        const videoWebPageCode = playerData[0] || "";
        const ytcfgVideoWebPage = playerData[1];
        const playerCode = playerData[2] || "";
        const playerUrl = playerData[3] || "";

        if (!videoWebPageCode) {
            const message = "Can't get video web page";
            Utils.logToConsole(`[${videoId}]: ${message}!`, true);
            return {
                "error_code": 500,
                "error_message": message,
                "video_id": videoId,
                "client_id": "web_page"
            };
        }

        const rawVideoInfoFromWebPage = Utils.extractPlayerResponseFromWebPageCode(videoWebPageCode);
        if (!rawVideoInfoFromWebPage) {
            const message = "Can't extract raw video info from web page";
            Utils.logToConsole(`[${videoId}]: ${message}!`, true);
            const j = {
                "error_code": 404,
                "error_message": message,
                "video_id": videoId,
                "client_id": "web_page"
            };
            if (requestedDataSet.has("web_page") || requestedDataSet.has("all")) {
                j["web_page_code"] = videoWebPageCode;
            }
            return j;
        }

        const parsedVideoInfo = Parser.parseVideoInfo(rawVideoInfoFromWebPage, client.id);
        if (parsedVideoInfo.title) {
            Utils.logToConsole(`[${consoleFont.FOREGROUND_GREEN}${videoId}${consoleFont.DEFAULT}]: ${consoleFont.FOREGROUND_CYAN}${parsedVideoInfo.title}${consoleFont.DEFAULT}`);
        }

        if (parsedVideoInfo.playability_status.is_sponsors_only) {
            Utils.logToConsole(`[${consoleFont.FOREGROUND_GREEN}${videoId}${consoleFont.DEFAULT}]: ${consoleFont.BACKGROUND_BRIGHT_RED}Sponsors only video!${consoleFont.DEFAULT}`);
        }

        let message;
        let errorCode;
        const downloadUrls = { "client_id": client.id };
        if (!parsedVideoInfo.playability_status.is_sponsors_only ||
            (parsedVideoInfo.playability_status.is_sponsors_only && cookies?.length > 0)) {
            if (!ytcfgVideoWebPage) {
                const message = "Can't extract the 'ytcfg' from web page";
                Utils.logToConsole(`[${videoId}]: ${message}!`, true);
                const j = {
                    "error_code": 404,
                    "error_message": message,
                    "video_id": videoId,
                    "client_id": "web_page"
                };
                if (requestedDataSet.has("raw_video_info") || requestedDataSet.has("all")) {
                    j['raw_video_info'] = rawVideoInfoFromWebPage;
                }
                if (requestedDataSet.has("parsed_video_info") || requestedDataSet.has("all")) {
                    j["video_info"] = parsedVideoInfo;
                }
                if (requestedDataSet.has("web_page") || requestedDataSet.has("all")) {
                    j["web_page_code"] = videoWebPageCode;
                }
                return j;
            }

            if (getUrls) {
                if (playerCode) {
                    const visitorData = ytcfgVideoWebPage.VISITOR_DATA;
                    if (visitorData) {
                        Utils.logToConsole(`[${consoleFont.FOREGROUND_GREEN}${videoId}${consoleFont.DEFAULT}]: Downloading the '${client.id}' API configuration...`);
                        const responseYtcfg = await Utils.downloadYouTubeClientConfiguratiom(client, videoId, cookies);
                        if (responseYtcfg[0] === 200) {
                            client.config = responseYtcfg[1];
                            const signatureTimestamp = ytcfgVideoWebPage.STS ?? Utils.extractSignatureTimestampFromPlayerCode(playerData[0]);
                            if (signatureTimestamp) {
                                const headers = {
                                    "Origin": Utils.YOUTUBE_URL,
                                    "User-Agent": `${client.userAgent},gzip(gfe)`,
                                    "X-Goog-Visitor-Id": visitorData,
                                    "X-YouTube-Client-Name": client.nameInHeaders,
                                    "X-YouTube-Client-Version": client.config.INNERTUBE_CONTEXT.client.clientVersion
                                };
                                if (cookieHeaderValue) {
                                    headers["cookie"] = cookieHeaderValue; 

                                    const authorizationHeaders = Clients.#generateCookieAuthorizationHeaders(filteredCookies, ytcfgVideoWebPage);
                                    if (authorizationHeaders) {
                                        for (const key in authorizationHeaders) {
                                            headers[key] = authorizationHeaders[key];
                                        }
                                    }
                                }

                                const body = {
                                    "context": client.config.INNERTUBE_CONTEXT,
                                    "playbackContext": {
                                        "contentPlaybackContext": {
                                            "html5Preference": "HTML5_PREF_WANTS",
                                            "signatureTimestamp": Number.parseInt(signatureTimestamp)
                                        }
                                    },
                                    "videoId": videoId,
                                    "contentCheckOk": true,
                                    "racyCheckOk": true
                                };
                                if (client.params) { body["params"] = client.params; }

                                Utils.logToConsole(`[${consoleFont.FOREGROUND_GREEN}${videoId}${consoleFont.DEFAULT}]: Calling ${client.id} API...`);
                                const responseApi = await fetch(Utils.API_PLAYER_ENDPOINT_URL,
                                    { "method": "POST", "headers": headers, "body": JSON.stringify(body) });
                                if (responseApi.status === 200) {
                                    const responseApiJson = await responseApi.json();
                                    if (responseApiJson.streamingData) {
                                        downloadUrls.streaming_data = responseApiJson.streamingData;
                                    }
                                } else {
                                    Utils.logToConsole(`[${videoId}]: Failed to call ${client.id} API! Error details: ${responseApi.status} ${responseApi.statusText}`, true);
                                }

                                if (downloadUrls.streaming_data) {
                                    const date = new Date();
                                    downloadUrls.api_calling_date = date.toISOString();
                                    downloadUrls.api_calling_date_epoch = date.getTime();

                                    if (!Parser.fixStreamingData(downloadUrls.streaming_data, playerCode, videoId)) {
                                        Utils.logToConsole(`[${videoId}]: ${consoleFont.BACKGROUND_BRIGHT_RED}There are some problems while fixing URLs...${consoleFont.DEFAULT}`);
                                    }
                                } else {
                                    Utils.logToConsole(`[${videoId}]: There are no streaming data found for this video!`, true);
                                }

                                errorCode = responseApi.status;
                                if (errorCode !== 200) { message = responseApi.statusText; }
                            } else {
                                errorCode = 404;
                                message = "Can't find signature timestamp!";
                                Utils.logToConsole(`[${videoId}]: ${message}`, true);
                            }
                        } else {
                            errorCode = responseYtcfg[0];
                            message = "Can't get client configuration";
                            Utils.logToConsole(`[${videoId}]: ${message}!`, true);
                        }
                    } else {
                        errorCode = 404;
                        message = "Can't get visitor data from the 'ytcfg'";
                        Utils.logToConsole(`[${videoId}]: ${message}`, true);
                    }
                } else {
                    errorCode = 404;
                    message = "Can't get player code";
                    Utils.logToConsole(`[${videoId}]: ${message}`, true);
                }
            } else {
                errorCode = 200;
                message = "URLs receiving/decryption is disabled";
                Utils.logToConsole(`[${consoleFont.FOREGROUND_GREEN}${videoId}${consoleFont.DEFAULT}]: ${consoleFont.FOREGROUND_ORANGE}${message}${consoleFont.DEFAULT}`);
            }
        } else {
            errorCode = 200;
            message = getUrls ? "Unable to get VIP video download URLs" : null;
        }

        const answer = {
            "error_code": errorCode,
            "video_id": videoId,
            "client_id": "web_page",
            "player_url": playerUrl
        };
        const isParsedVideoInfoRequested = requestedDataSet.has("parsed_video_info") || requestedDataSet.has("all");
        if (message) { answer.message = message; }
        if (getUrls) {
            const root = isParsedVideoInfoRequested && parsedVideoInfo ? parsedVideoInfo : answer;
            root.download_urls = downloadUrls;
        }
        if (isParsedVideoInfoRequested) {
            answer["video_info"] = parsedVideoInfo;
        }
        if (requestedDataSet.has("raw_video_info") || requestedDataSet.has("all")) {
            answer['raw_video_info'] = rawVideoInfoFromWebPage;
        }
        if (requestedDataSet.has("web_page") || requestedDataSet.has("all")) {
            answer["web_page_code"] = videoWebPageCode;
        }

        return answer;
    }

    static #generateCookieAuthorizationHeaders(cookies, ytcfg) {
        const secure3papisid = Utils.getCookie(cookies, "__Secure-3PAPISID");
        const sapisid = Utils.getCookie(cookies, "SAPISID") || secure3papisid;
        if (sapisid && secure3papisid) {
            const secure1papisid = Utils.getCookie(cookies, "__Secure-1PAPISID");
            if (secure1papisid) {
                const timestamp = Math.round(Date.now() / 1000);
                const authorization = [
                    ["SAPISIDHASH", sapisid.value],
                    ["SAPISID1PHASH", secure1papisid.value],
                    ["SAPISID3PHASH", secure3papisid.value]
                ].reduce((r, v) => {
                    const partsJoined = [ytcfg.USER_SESSION_ID, timestamp, v[1], Utils.YOUTUBE_URL].join(" ");
                    const sha1 = crypto.createHash("sha1");
                    const hash = sha1.update(partsJoined).digest("hex");
                    r.push(`${v[0]} ${timestamp}_${hash}_u`);
                    return r;
                }, []);

                const headers = {
                    "Authorization": authorization.join(" "),
                    "X-Origin": Utils.YOUTUBE_URL
                };

                if (ytcfg.LOGGED_IN) {
                    headers["X-Youtube-Bootstrap-Logged-In"] = "true";
                }

                return headers;
            }
        }
    }
}

module.exports = Clients;
