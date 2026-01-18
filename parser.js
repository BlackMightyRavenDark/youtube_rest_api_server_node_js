"use strict";

const consoleFont = require("./consoleFont");
const querystring = require("node:querystring");
const Utils = require("./utils");

const nParams = new Map();

class Parser {
    static fixRawVideoInfo(rawVideoInfo, playerCode, videoId) {
        if (rawVideoInfo.streamingData) {
            return this.fixStreamingData(rawVideoInfo.streamingData, playerCode, videoId);
        } else {
            Utils.logToConsole(videoId ? `[${videoId}]: There is no streaming data found for this video!` :
                "There is no streaming data found for this video!", true);
            return false;
        }
    }

    static fixStreamingData(streamingData, playerCode, videoId) {
        Utils.logToConsole(videoId ? `[${consoleFont.FOREGROUND_BRIGHT_WHITE}${videoId}${consoleFont.DEFAULT}]: ${consoleFont.FOREGROUND_CYAN}Fixing URLs...${consoleFont.DEFAULT}` :
            `${consoleFont.FOREGROUND_CYAN}Fixing URLs...${consoleFont.DEFAULT}`);
        if (!streamingData || !playerCode) { return false; }

        const a = this.fixFormatUrls(streamingData.formats, playerCode, videoId);
        const b = this.fixFormatUrls(streamingData.adaptiveFormats, playerCode, videoId);
        const success = a && b;
        if (!success) {
            Utils.logToConsole(videoId ? `[${videoId}]: There are no download URLs found for this video!` :
                "There are no download URLs found for this video!", true);
        }

        return success;
    }

    static fixFormatUrls(formats, playerCode, videoId) {
        if (!formats) { return false; }

        let globalVariable;
        let nDecryptionFunctionCode;
        let cipherDecriptionFunction;

        for (let i = 0; i < formats.length; ++i) {
            const cipherQuery = formats[i].signatureCipher ? querystring.parse(formats[i].signatureCipher) : null;
            const originalUrl = cipherQuery ? cipherQuery["url"] : formats[i].url;

            if (!originalUrl && !cipherQuery) {
                Utils.logToConsole(videoId ? `[${videoId}]: Format ID ${formats[i].itag} URL is not found!` :
                    `Format ID ${formats[i].itag} URL is not found!`, true);
                continue;
            }

            if (originalUrl) {
                const formatIdString = formats[i].isDrc ? `${formats[i].itag}-DRC` : formats[i].itag;
                const splittedUrl = originalUrl.split("?");
                const queryUrl = querystring.parse(splittedUrl[1]);
                if (queryUrl["n"]) {
                    const encryptedN = queryUrl["n"];
                    if (nParams.has(encryptedN)) {
                        queryUrl["n"] = nParams.get(encryptedN);
                        Utils.logToConsole(videoId ? `[${consoleFont.FOREGROUND_BRIGHT_WHITE}${videoId}${consoleFont.DEFAULT}]: Format ID ${formatIdString} 'n'-parameter is already decrypted: ${queryUrl["n"]}` :
                            `Format ID ${formatIdString} 'n'-parameter is already decrypted: ${queryUrl["n"]}`);
                    } else {
                        if (!playerCode) {
                            Utils.logToConsole(videoId ? `[${videoId}]: Can't decrypt 'n'-parameter! No player code available!` :
                                "Can't decrypt 'n'-parameter! No player code available!", true);
                            return false;
                        } else {
                            if (!nDecryptionFunctionCode) {
                                if (!globalVariable) {
                                    globalVariable = Utils.extractGlobalVariableFromPlayerCode(playerCode);
                                }
                                if (globalVariable) {
                                    nDecryptionFunctionCode = Utils.extractNFunctionCode(playerCode, globalVariable, encryptedN);
                                } else {
                                    Utils.logToConsole(videoId ? `[${videoId}]: Can't decrypt 'n'-parameter! Unable to find decryption function!` :
                                        "Can't decrypt 'n'-parameter! Unable to find decryption function!", true);
                                    return false;
                                }
                            }

                            if (nDecryptionFunctionCode) {
                                Utils.logToConsole(videoId ? `[${consoleFont.FOREGROUND_BRIGHT_WHITE}${videoId}${consoleFont.DEFAULT}]: Decrypting the format ID ${formatIdString} 'n'-parameter '${encryptedN}'...` :
                                    `Decrypting the format ID ${formatIdString} 'n'-parameter '${encryptedN}'...`);
                                const decryptedN = eval(nDecryptionFunctionCode);
                                if (typeof(decryptedN) === "string" && decryptedN !== "" && decryptedN !== encryptedN) {
                                    queryUrl["n"] = decryptedN;
                                    nParams.set(encryptedN, decryptedN);
                                    Utils.logToConsole(videoId ? `[${consoleFont.FOREGROUND_BRIGHT_WHITE}${videoId}${consoleFont.DEFAULT}]: Format ID ${formatIdString} 'n'-parameter is decrypted: ${encryptedN} -> ${decryptedN}` :
                                        `Format ID ${formatIdString} 'n'-parameter is decrypted: ${encryptedN} -> ${decryptedN}`);
                                } else {
                                    Utils.logToConsole(videoId ? `[${videoId}]: Format ID ${formatIdString} 'n'-parameter is not decrypted!` :
                                        `Format ID ${formatIdString} 'n'-parameter is not decrypted!`, true);
                                }
                            } else {
                                Utils.logToConsole(videoId ? `[${videoId}]: Can't decrypt 'n'-parameter! No decryption function code available!` :
                                    "Can't decrypt 'n'-parameter! No decryption function code available!", true);
                                return false;
                            }
                        }
                    }
                }

                if (cipherQuery) {
                    if (!cipherDecriptionFunction) {
                        cipherDecriptionFunction = Utils.extractCipherDeryptionFunctionCode(playerCode);
                        if (!cipherDecriptionFunction) {
                            Utils.logToConsole(videoId ? `[${videoId}]: Unable to decrypt cipher! Can't find function code!` :
                                "Unable to decrypt cipher! Can't find function code!", true);
                            return false;
                        }
                    }

                    const encryptedCipherSignature = cipherQuery["s"];
                    Utils.logToConsole(videoId ? `[${consoleFont.FOREGROUND_BRIGHT_WHITE}${videoId}${consoleFont.DEFAULT}]: Format ID ${formatIdString} decrypting cipher signature '${encryptedCipherSignature}'...` :
                        `Format ID ${formatIdString} decrypting cipher signature '${encryptedCipherSignature}'...`);
                    const preparedCode = `${cipherDecriptionFunction[0]}\r\n${cipherDecriptionFunction[1]}("${encryptedCipherSignature}");`;
                    const decryptedCipherSignature = eval(preparedCode);
                    if (decryptedCipherSignature && decryptedCipherSignature != encryptedCipherSignature) {
                        Utils.logToConsole(videoId ? `[${consoleFont.FOREGROUND_BRIGHT_WHITE}${videoId}${consoleFont.DEFAULT}]: Format ID ${formatIdString} cipher signature is decrypted: ${decryptedCipherSignature}` :
                            `Format ID ${formatIdString} cipher signature is decrypted: ${decryptedCipherSignature}`);
                        queryUrl["sig"] = decryptedCipherSignature;
                        delete formats[i].signatureCipher;
                    } else {
                        Utils.logToConsole(videoId ? `[${videoId}]: Format ID ${formatIdString} cipher signature is not decrypted!` :
                            `Format ID ${formatIdString} cipher signature is not decrypted!`, true);
                    }
                }

                formats[i].url = `${splittedUrl[0]}?${querystring.stringify(queryUrl)}`;
            }
        }

        return true;
    }

    static parseVideoInfo(rawVideoInfo, clientId, apiCallingDate) {
        const status = rawVideoInfo.playabilityStatus.status || "";
        const reason = rawVideoInfo.playabilityStatus.reason || "";
        const isStatusOk = status?.toLowerCase() === "ok";
        const isPrivate = reason?.includes("private");
        const isAgeRestricted = !!reason && (reason.includes("confirm your age") || reason.includes("возраст"));
        const isLoginRequired = !!status && (status.includes("LOGIN") || status.includes("ВХОД"));
        const isBotWarning = !!reason && (reason.includes("not a bot") || reason.includes("вы не бот"));

        const parsed = {
            "playability_status": {
                "status": status,
                "reason": reason,
                "reason_details": rawVideoInfo.playabilityStatus.subreason || "",
                "is_playable": isStatusOk,
                "is_playable_in_embed": rawVideoInfo.playabilityStatus.playableInEmbed || false,
                "is_private": isPrivate,
                "is_adult": isAgeRestricted,
                "is_login_required": isLoginRequired,
                "is_bot_warning": isBotWarning
            }
        };

        if (!isStatusOk) {
            const playerErrorMessageRenderer = rawVideoInfo.playabilityStatus.errorScreen?.playerErrorMessageRenderer;
            if (playerErrorMessageRenderer) {
                const runs = playerErrorMessageRenderer.subreason.runs;
                if (!parsed.playability_status.reason_details && runs && runs.length > 0) {
                    parsed.playability_status.reason_details = runs[0].text?.trim();
                }
            }

            if (!parsed.playability_status.reason) {
                parsed.playability_status.reason = playerErrorMessageRenderer.reason || "";
            }

            const playerLegacyDesktopYpcOfferRenderer = rawVideoInfo.playabilityStatus.errorScreen?.playerLegacyDesktopYpcOfferRenderer;
            if (playerLegacyDesktopYpcOfferRenderer) {
                parsed.playability_status.is_offer = true;
                parsed.playability_status.offer_id = playerLegacyDesktopYpcOfferRenderer.offerId || "";
                if (typeof(playerLegacyDesktopYpcOfferRenderer.offerDescription) === "string" &&
                    playerLegacyDesktopYpcOfferRenderer.offerDescription !== reason) {
                    parsed.playability_status.offer_description = playerLegacyDesktopYpcOfferRenderer.offerDescription;
                }
            }

            const thumbnails = playerErrorMessageRenderer?.thumbnail?.thumbnails;
            if (thumbnails?.length > 0) {
                parsed.playability_status.thumbnail_url = `https:${thumbnails[0].url}`;
            }
        }

        if (rawVideoInfo.videoDetails) {
            parsed.id = rawVideoInfo.videoDetails.videoId;
            parsed.title = rawVideoInfo.videoDetails.title;
            parsed.owner_channel = {
                "title": rawVideoInfo.videoDetails.author,
                "id": rawVideoInfo.videoDetails.channelId
            }
            parsed.url = Utils.getYouTubeVideoUrl(parsed.id);
            parsed.length_seconds = rawVideoInfo.videoDetails.lengthSeconds ? Number.parseInt(rawVideoInfo.videoDetails.lengthSeconds) : 0;
            parsed.length = this.#formatVideoDuration(parsed.length_seconds);
            parsed.view_count = Number.parseInt(rawVideoInfo.videoDetails.viewCount);
            parsed.is_private = rawVideoInfo.videoDetails.isPrivate;
            parsed.is_live_content = rawVideoInfo.videoDetails.isLiveContent || false;
            parsed.is_crawlable = rawVideoInfo.videoDetails.isCrawlable;
            if (rawVideoInfo.videoDetails.shortDescription) {
                parsed.description = rawVideoInfo.videoDetails.shortDescription;
            }
        }

        const jMicroformat = rawVideoInfo.microformat?.playerMicroformatRenderer;
        if (jMicroformat) {
            if (!parsed.description && jMicroformat.description?.simpleText) {
                parsed.description = jMicroformat.description.simpleText;
            }
            parsed.category = jMicroformat.category;
            parsed.is_short_format = jMicroformat.isShortsEligible;
            parsed.like_count = Number.parseInt(jMicroformat.likeCount);
            parsed.is_family_safe = jMicroformat.isFamilySafe;
            parsed.is_unlisted = jMicroformat.isUnlisted;
            parsed.date_publish = jMicroformat.publishDate;
            const datePublish = new Date(jMicroformat.publishDate);
            parsed.date_publish_unix = datePublish.getTime();
            if (jMicroformat.uploadDate) {
                const dateUpload = new Date(jMicroformat.uploadDate);
                parsed.date_upload = jMicroformat.uploadDate;
                parsed.date_upload_unix = dateUpload.getTime();
            }
            if (jMicroformat.liveBroadcastDetails) {
                const liveInfo = {
                    "is_live_now": jMicroformat.liveBroadcastDetails.isLiveNow || false,
                    "is_low_latency_live_stream": rawVideoInfo.videoDetails?.isLowLatencyLiveStream || false
                };

                if (jMicroformat.liveBroadcastDetails.startTimestamp) {
                    liveInfo.start_timestamp = jMicroformat.liveBroadcastDetails.startTimestamp;
                    const dateStart = new Date(jMicroformat.liveBroadcastDetails.startTimestamp);
                    liveInfo.start_timestamp_unix = dateStart.getTime();
                }

                if (liveInfo.is_live_now && jMicroformat.liveBroadcastDetails.endTimestamp) {
                    liveInfo.end_timestamp = jMicroformat.liveBroadcastDetails.endTimestamp;
                    const dateEnd = new Date(jMicroformat.liveBroadcastDetails.endTimestamp);
                    liveInfo.end_timestamp_unix = dateEnd.getTime();
                }

                parsed.live_stream_info = liveInfo;
            }
        }

        const parsedThumbnails = Utils.extractThumbnailList(rawVideoInfo);
        if (parsedThumbnails?.length > 0) { parsed.thumbnails = parsedThumbnails; }

        if (rawVideoInfo.streamingData) {
            const clientObject = {
                "client_id": clientId ?? "unknown",
                "streaming_data": rawVideoInfo.streamingData
            }
            if (apiCallingDate) {
                clientObject.api_calling_date = apiCallingDate;
                clientObject.api_calling_date_unix_ticks = apiCallingDate.getTime() * 10000;
            }

            parsed.download_urls = [ clientObject ];
        }

        return parsed;
    }

    static #formatVideoDuration(seconds) {
        if (seconds > 0) {
            const date = new Date(seconds * 1000);
            if (seconds >= 3600) {
                return `${date.getUTCHours()}:${date.getUTCMinutes().toString().padStart(2, "0")}:${date.getUTCSeconds().toString().padStart(2, "0")}`;
            } else if (seconds >= 60) {
                return `${date.getUTCMinutes()}:${date.getUTCSeconds().toString().padStart(2, "0")}`;
            } else if (seconds > 0) {
                return `0:${date.getUTCSeconds().toString().padStart(2, "0")}`;
            }
        }

        return "0:00:00";
    }
}

module.exports = Parser;
