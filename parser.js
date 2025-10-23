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

    static parseVideoInfo(rawVideoInfo, clientId) {
        const parsed = {
            "playability_status": {
                "is_playable": rawVideoInfo.playabilityStatus.status?.toLowerCase() === "ok",
                "status": rawVideoInfo.playabilityStatus.status
            }
        };

        const liveInfo = { };

        if (parsed.playability_status.is_playable) {
            parsed.playability_status.is_playable_in_embed = rawVideoInfo.playabilityStatus.playableInEmbed;
        } else {
            parsed.playability_status.reason = rawVideoInfo.playabilityStatus.reason;
            parsed.playability_status.is_sponsors_only = rawVideoInfo.playabilityStatus.errorScreen.playerLegacyDesktopYpcOfferRenderer ? true : false;
            const runs = parsed.playability_status.is_sponsors_only ? null : rawVideoInfo.playabilityStatus.errorScreen.playerErrorMessageRenderer?.subreason?.runs;
            const subreasonText = parsed.playability_status.is_sponsors_only ? rawVideoInfo.playabilityStatus.errorScreen.playerLegacyDesktopYpcOfferRenderer.offerDescription :
                runs?.reduce((previous, current) => previous += current.text, "");
            parsed.playability_status.subreason = subreasonText;
            if (!parsed.playability_status.is_sponsors_only) {
                parsed.playability_status.image_url = `https:${rawVideoInfo.playabilityStatus.errorScreen.playerErrorMessageRenderer.thumbnail.thumbnails[0].url}`;
            }
        }

        if (rawVideoInfo.videoDetails) {
            parsed.id = rawVideoInfo.videoDetails.videoId;
            parsed.title = rawVideoInfo.videoDetails.title;
            parsed.owner_channel = {
                "title": rawVideoInfo.videoDetails.author,
                "id": rawVideoInfo.videoDetails.channelId
            };
            if (rawVideoInfo.videoDetails.shortDescription) {
                parsed.description = rawVideoInfo.videoDetails.shortDescription;
            }
            parsed.length_seconds = rawVideoInfo.videoDetails.lengthSeconds ? Number.parseInt(rawVideoInfo.videoDetails.lengthSeconds) : 0;
            if (parsed.length_seconds) {
                const date = new Date(parsed.length_seconds * 1000);
                parsed.length = parsed.length_seconds >= 3600 ?
                    `${date.getUTCHours()}:${date.getUTCMinutes().toString().padStart(2, "0")}:${date.getUTCSeconds().toString().padStart(2, "0")}` :
                    `${date.getUTCMinutes().toString().padStart(2, "0")}:${date.getUTCSeconds().toString().padStart(2, "0")}`;
            }
            parsed.view_count = Number.parseInt(rawVideoInfo.videoDetails.viewCount);
            parsed.is_private = rawVideoInfo.videoDetails.isPrivate;
            parsed.is_live_content = rawVideoInfo.videoDetails.isLiveContent || false;
            if (parsed.is_live_content) {
                liveInfo.is_live_now = rawVideoInfo.videoDetails.isLive || false;
                liveInfo.is_low_latency_live_stream = rawVideoInfo.videoDetails.isLowLatencyLiveStream || false;
                parsed.live_info = liveInfo;
            }
            parsed.is_crawlable = rawVideoInfo.videoDetails.isCrawlable;
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
            parsed.date_publish_epoch = datePublish.getTime();
            if (jMicroformat.uploadDate) {
                const dateUpload = new Date(jMicroformat.uploadDate);
                parsed.date_upload = jMicroformat.uploadDate;
                parsed.date_upload_epoch = dateUpload.getTime();
            }
            if (jMicroformat.liveBroadcastDetails) {
                liveInfo.is_live_now = jMicroformat.liveBroadcastDetails.isLiveNow || false;
                if (jMicroformat.liveBroadcastDetails.startTimestamp) {
                    liveInfo.start_date = jMicroformat.liveBroadcastDetails.startTimestamp;
                    const dateStart = new Date(jMicroformat.liveBroadcastDetails.startTimestamp);
                    liveInfo.start_date_epoch = dateStart.getTime();

                    if (jMicroformat.liveBroadcastDetails.endTimestamp) {
                        liveInfo.end_date = jMicroformat.liveBroadcastDetails.endTimestamp;
                        const dateEnd = new Date(jMicroformat.liveBroadcastDetails.endTimestamp);
                        liveInfo.end_date_epoch = dateEnd.getTime();
                    }
                }

                if (!parsed.live_info) { parsed.live_info = liveInfo; }
            }
        }

        parsed.thumbnails = Utils.extractThumbnailList(rawVideoInfo);
        parsed.download_urls = { "client_id": clientId ?? "unknown" };
        if (rawVideoInfo.streamingData) {
            parsed.download_urls.streaming_data = rawVideoInfo.streamingData;
        }

        return parsed;
    }
}

module.exports = Parser;
