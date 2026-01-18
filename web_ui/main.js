"use strict";

const YOUTUBE_URL = "https://www.youtube.com";
const WEB_UI_PATH = "/web_ui/";

const inputUrl = document.querySelector("#inputUrl");
const btnSearch = document.querySelector("#btnSearch");
const clientSelector = document.querySelector("#clientSelector");
const checkBoxGetUrls = document.querySelector("#checkboxGetUrls");
const checkBoxUseCookies = document.querySelector("#checkboxUseCookies");
const textareaCookies = document.querySelector("textarea");
const btnSendDefaultCookies = document.querySelector(".btn-send-default-cookies");
const btnClearDefaultCookies = document.querySelector(".btn-clear-default-cookies");
const nodeLoadingIndicator = document.querySelector(".loading-container");
const nodeErrorMessage = document.querySelector(".error-message");
const nodeVideoInfoRoot = document.querySelector(".video-info-root");
let timerCountdown;

inputUrl.addEventListener("input", () => {
    const encoded = inputUrl.value ? encodeURIComponent(inputUrl.value) : null;
    history.pushState(null, null, encoded ? `${WEB_UI_PATH}?input=${encoded}` : WEB_UI_PATH);
});

textareaCookies.addEventListener("focusout", () => {
    showError("");
    if (textareaCookies.value) {
        localStorage.setItem("cookies", textareaCookies.value);
    } else if (localStorage.getItem("cookies")) {
        localStorage.removeItem("cookies");
    }
});

btnSendDefaultCookies.addEventListener("click", async () => {
    enableControls(false);
    if (textareaCookies.value) {
        const jCookies = tryParseJson(textareaCookies.value);
        if (!jCookies) {
            alert("Ошибка списка куков!");
            enableControls(true);
            return;
        }

        const body = JSON.stringify({ "cookies": jCookies });
        const options = {
            "method": "PUT",
            "headers": {
                "Content-Type": "application/json",
                "Content-Length": Uint8Array.from(body).length.toString()
            },
            "body": body
        }
        const response = await fetch("/api/default_cookies", options);
        const responseText = await response.text();
        const message = response.status === 200 ? responseText : `Ошибка! ${responseText}!`;
        alert(message)
    } else {
        alert("Введите список куков!");
    }
    enableControls(true);
});

btnClearDefaultCookies.addEventListener("click", async () => {
    const response = await fetch("/api/default_cookies", { "method": "DELETE" });
    const responseText = await response.text();
    const message = response.status === 200 ? responseText : `Ошибка! ${responseText}!`;
    alert(message)
});

btnSearch.addEventListener("click", async () => {
    enableControls(false);
    showError("");

    if (timerCountdown) { clearInterval(timerCountdown); timerCountdown = null; }
    clearChildNodes(nodeVideoInfoRoot);

    const videoUrl = inputUrl.value?.trim();
    if (!videoUrl) {
        alert("Введите ссылку или ID видео!");
        enableControls(true);
        return;
    }

    if (videoUrl.includes(" ")) {
        alert("Ссылка или ID не должны содержать пробелов!");
        enableControls(true);
        return;
    }

    const videoId = videoUrl.length === 11 ? videoUrl : extractVideoIdFromUrl(videoUrl);
    if (!videoId) {
        alert("Не удалось распознать ID видео! Извлеките ID вручную!");
        enableControls(true);
        return;
    }

    if (checkBoxUseCookies.checked && clientSelector.options[clientSelector.selectedIndex].getAttribute("supports_cookies") !== "true") {
        alert("Ошибка! Выбранный клиент не поддерживает куки!");
        enableControls(true);
        return;
    }

    const jCookies = checkBoxUseCookies.checked ? tryParseCookies() : null;
    if (checkBoxUseCookies.checked && !jCookies) {
        showError("Can't parse cookies!");
        enableControls(true);
        return;
    }

    nodeLoadingIndicator.style.display = "flex";
    const response = await getVideoInfo(videoId, clientSelector.value,
        checkBoxGetUrls.checked, jCookies, checkBoxUseCookies.checked);
    nodeLoadingIndicator.style.display = "none";
    if (response[0] === 200) {
        parseJson(response[1]);
        if (response[1].message && typeof(response[1].message) === "string") {
            showError(response[1].message);
        }
    } else {
        console.log(response);
        const errorMessage = response[1].error_message || response[1].message || response[0].statusText || "Unknown error";
        showError(errorMessage);
    }

    enableControls(true);
});

function parseJson(json) {
    const jParsedVideoInfo = json.video_info;

    if (!jParsedVideoInfo) {
        showError("Video information is not found!");
        return;
    }

    const nodeVideoImage = document.createElement("img");
    if (jParsedVideoInfo.thumbnails?.length > 0) {
        nodeVideoImage.setAttribute("src", jParsedVideoInfo.thumbnails[0].url);
    }
    nodeVideoImage.setAttribute("alt", "thumbnail");

    const nodeVideoImageAnchor = document.createElement("a");
    if (jParsedVideoInfo.thumbnails?.length > 0) {
        nodeVideoImageAnchor.setAttribute("href", jParsedVideoInfo.thumbnails[0].url);
        nodeVideoImageAnchor.setAttribute("target", "_blank");
    }
    nodeVideoImageAnchor.appendChild(nodeVideoImage);

    const nodeVideoImageWrapper = document.createElement("div");
    nodeVideoImageWrapper.classList.add("video-info__image-wrapper");
    nodeVideoImageWrapper.appendChild(nodeVideoImageAnchor);

    const nodeVideoImageFormatsWrapper = document.createElement("div");
    nodeVideoImageFormatsWrapper.classList.add("image-formats-wrapper");

    if (jParsedVideoInfo.thumbnails?.length > 0) {
        for (const thumbnail of jParsedVideoInfo.thumbnails) {
            const nodeVideoThumbnailButton = document.createElement("button");
            nodeVideoThumbnailButton.classList.add("button-thumbnail");

            const nodeVideoThumbnailFileName = document.createElement("span");
            nodeVideoThumbnailFileName.textContent = extractThumbnailFileName(thumbnail.url) || "unnamed";
            nodeVideoThumbnailButton.addEventListener("click", () => {
                nodeVideoImage.setAttribute("src", thumbnail.url);
                nodeVideoImageAnchor.setAttribute("href", thumbnail.url);
                nodeVideoImageFormatsWrapper.childNodes.forEach(node => {
                    if (node.classList.contains("button-thumbnail__active")) { node.classList.remove("button-thumbnail__active"); }
                });
                nodeVideoThumbnailButton.classList.add("button-thumbnail__active");
            });

            const nodeVideoThumbnailSize = document.createElement("span");
            nodeVideoThumbnailSize.textContent = `${thumbnail.width}x${thumbnail.height}`;

            const nodeVideoThumbnailFileNameWrapper = document.createElement("div");
            nodeVideoThumbnailFileNameWrapper.appendChild(nodeVideoThumbnailFileName);
            const nodeVideoThumbnailSizeWrapper = document.createElement("div");
            nodeVideoThumbnailSizeWrapper.appendChild(nodeVideoThumbnailSize);

            const nodeVideoThumbnailButtonFlex = document.createElement("div");
            nodeVideoThumbnailButtonFlex.appendChild(nodeVideoThumbnailFileNameWrapper);
            nodeVideoThumbnailButtonFlex.appendChild(nodeVideoThumbnailSizeWrapper);
            nodeVideoThumbnailButton.appendChild(nodeVideoThumbnailButtonFlex);
            nodeVideoImageFormatsWrapper.appendChild(nodeVideoThumbnailButton);
        }

        nodeVideoImageFormatsWrapper.firstChild?.classList.add("button-thumbnail__active");
    }

    const nodeVideoImageContainer = document.createElement("div");
    nodeVideoImageContainer.classList.add("video-info__image-container");
    nodeVideoImageContainer.appendChild(nodeVideoImageWrapper);
    nodeVideoImageContainer.appendChild(nodeVideoImageFormatsWrapper);

    const nodeVideoBaseInfo = document.createElement("div");
    nodeVideoBaseInfo.appendChild(nodeVideoImageContainer);

    if (jParsedVideoInfo.title) {
        const nodeVideoTitle = document.createElement("a");
        nodeVideoTitle.textContent = jParsedVideoInfo.title;
        if (jParsedVideoInfo.id) {
            nodeVideoTitle.setAttribute("href", `${YOUTUBE_URL}/watch?v=${jParsedVideoInfo.id}`);
            nodeVideoTitle.setAttribute("target", "_blank");
        }
        nodeVideoBaseInfo.appendChild(nodeVideoTitle);
    }

    if (jParsedVideoInfo.owner_channel) {
        if (jParsedVideoInfo.owner_channel.title) {
            const nodeChannelTitle = document.createElement("a");
            nodeChannelTitle.textContent = jParsedVideoInfo.owner_channel.title;
            if (jParsedVideoInfo.owner_channel.id) {
                nodeChannelTitle.setAttribute("href", `${YOUTUBE_URL}/channel/${jParsedVideoInfo.owner_channel.id}/videos`);
                nodeChannelTitle.setAttribute("target", "_blank");
            }
            nodeVideoBaseInfo.appendChild(nodeChannelTitle);
        }
    }

    nodeVideoInfoRoot.appendChild(nodeVideoBaseInfo);

    const urls = jParsedVideoInfo.download_urls;
    if (urls?.length > 0 && urls[0].streaming_data && jParsedVideoInfo.playability_status?.is_playable) {
        const nodeFormatList = parseStreamingData(urls[0].streaming_data);
        if (nodeFormatList.childNodes.length > 0) { nodeVideoInfoRoot.appendChild(nodeFormatList); }
    } else {
        const nodePlayabilityStatus = parsePlayabilityStatus(jParsedVideoInfo.playability_status);
        nodeVideoInfoRoot.appendChild(nodePlayabilityStatus);
    }

    const nodeGroupOther = createOtherGroup(json);
    if (nodeGroupOther.childNodes.length > 0) { nodeVideoInfoRoot.appendChild(nodeGroupOther); }
}

function parsePlayabilityStatus(playabilityStatus) {
    const node1 = document.createElement("div");
    node1.textContent = "Список форматов и ссылки для скачивания отсутствуют!";

    if (playabilityStatus && !playabilityStatus.is_playable) {
        const node2 = document.createElement("div");
        node2.textContent = `Состояние: ${playabilityStatus.status}`;

        const node3 = document.createElement("div");
        node3.textContent = playabilityStatus.reason;

        const node4 = document.createElement("div");
        node4.textContent = playabilityStatus.subreason;

        if (!playabilityStatus.subreason || playabilityStatus.subreason === playabilityStatus.reason) {
            node4.style.display = "none";
        }

        const nodeRoot = document.createElement("div");
        [node1, node2, node3, node4].forEach(node => {
            node.classList.add("playability-status");
            nodeRoot.appendChild(node);
        });

        return nodeRoot;
    }

    node1.classList.add("playability-status");
    return node1;
}

function parseStreamingData(jStreamingData) {
    const nodeFormatGroupList = document.createElement("div");
    nodeFormatGroupList.classList.add("formatlist-container");

    if (jStreamingData.adaptiveFormats) {
        const videoFormats = jStreamingData.adaptiveFormats.filter(element => element.mimeType.includes("video")).sort((a, b) => b.contentLength - a.contentLength);
        if (videoFormats.length > 0) {
            const nodeFormatGroup = createGroup(videoFormats, "Video");
            nodeFormatGroupList.appendChild(nodeFormatGroup);
        }

        const audioFormats = jStreamingData.adaptiveFormats.filter(element => element.mimeType.includes("audio")).sort((a, b) => b.contentLength - a.contentLength);
        if (audioFormats.length > 0) {
            const nodeFormatGroup = createGroup(audioFormats, "Audio");
            nodeFormatGroupList.appendChild(nodeFormatGroup);
        }
    }

    if (jStreamingData.formats) {
        const containerFormats = jStreamingData.formats.filter(() => true).sort((a, b) => b.contentLength - a.contentLength);
        if (containerFormats.length > 0) {
            const nodeFormatGroup = createGroup(containerFormats, "Container");
            nodeFormatGroupList.appendChild(nodeFormatGroup);
        }
    }

    if (nodeFormatGroupList.childNodes.length > 0 && jStreamingData.expiresInSeconds) {
        const lifeTimeSeconds = typeof(jStreamingData.expiresInSeconds) === "string" ?
            Number.parseInt(jStreamingData.expiresInSeconds) : jStreamingData.expiresInSeconds;
        if (typeof(lifeTimeSeconds) === "number") {
            const expirationDate = new Date();
            expirationDate.setSeconds(expirationDate.getSeconds() + lifeTimeSeconds);
            const nodeExpirationDate = document.createElement("div");

            const display = () => {
                const currentDate = new Date();
                let formatted;
                if (expirationDate > currentDate) {
                    const difference = new Date(expirationDate - currentDate);
                    formatted = formatTime(difference);
                } else {
                    formatted = ["0:00:00", 0];
                }

                nodeExpirationDate.textContent = `Ссылки действительны до '${expirationDate.toLocaleString()}', Осталось: ${formatted[0]}`;
                return formatted[1];
            }

            timerCountdown = setInterval(() => {
                if (timerCountdown && display() <= 0) { clearInterval(timerCountdown); timerCountdown = null; }
            }, 1000);
            display();

            nodeFormatGroupList.appendChild(nodeExpirationDate);
        }
    }

    return nodeFormatGroupList;
}

function createGroup(formats, groupName) {
    const nodeGroupItemList = document.createElement("div");
    nodeGroupItemList.classList.add("item-list");
    formats.forEach(format => {
        const nodeFormatItem = document.createElement("a");
        if (format.url) {
            nodeFormatItem.setAttribute("href", format.url);
            nodeFormatItem.setAttribute("target", "_blank");
        }
        const classes = getItemStyles(groupName);
        classes.forEach(className => nodeFormatItem.classList.add(className));
        nodeGroupItemList.appendChild(nodeFormatItem);

        const mimeSplitted = format.mimeType.split(";");
        const media = mimeSplitted[0].split("/");
        const mediaType = media[0];
        const fileExtension = media[1];
        const codecs = searchRegularExpression([/"(.*?)"/], mimeSplitted[1]);

        const nodeFormatId = document.createElement("span");
        nodeFormatId.textContent = format.isDrc ? `ID: ${format.itag}-DRC` : `ID: ${format.itag}`;
        nodeFormatItem.appendChild(nodeFormatId);

        if (mediaType === "video") {
            const nodeQualityLabel = document.createElement("span");
            nodeQualityLabel.textContent = `${format.qualityLabel}`;
            nodeFormatItem.appendChild(nodeQualityLabel);

            const nodeResolutionFps = document.createElement("span");
            nodeResolutionFps.textContent = `${format.width}x${format.height}, ${format.fps}fps`;
            nodeFormatItem.appendChild(nodeResolutionFps);
        } else if (format.isVb) {
            const nodeVoiceBoosted = document.createElement("span");
            nodeVoiceBoosted.textContent = "<Voice boost>";
            nodeFormatItem.appendChild(nodeVoiceBoosted);
        }

        const nodeFileExtension = document.createElement("span");
        nodeFileExtension.textContent = `.${getFixedFileExtension(mediaType, fileExtension, groupName === "Container").toUpperCase()}`;
        nodeFormatItem.appendChild(nodeFileExtension);

        if (codecs) {
            const nodeCodecs = document.createElement("span");
            nodeCodecs.textContent = codecs;
            nodeFormatItem.appendChild(nodeCodecs);
        }

        if (format.audioTrack) {
            const nodeAudioTrackId = document.createElement("span");
            nodeAudioTrackId.textContent = format.audioTrack.id;

            const nodeAudioTrackDisplayName = document.createElement("span");
            nodeAudioTrackDisplayName.textContent = format.audioTrack.displayName;

            const nodeAudioTrackWrapper = document.createElement("div");
            nodeAudioTrackWrapper.appendChild(nodeAudioTrackId);
            nodeAudioTrackWrapper.appendChild(nodeAudioTrackDisplayName);

            if (format.audioTrack.audioIsDefault) {
                const nodeAudioTrackDefault = document.createElement("span");
                nodeAudioTrackDefault.classList.add("format-item__default");
                nodeAudioTrackDefault.textContent = "DEFAULT";
                nodeAudioTrackWrapper.appendChild(nodeAudioTrackDefault);

                if (!nodeFormatItem.classList.contains("format-default")) {
                    nodeFormatItem.classList.add("format-default");
                }
            }

            const trackDisplayNameLowercased = format.audioTrack.displayName;
            if (trackDisplayNameLowercased.includes("origin") || trackDisplayNameLowercased.includes("оригинальная")) {
                const nodeAudioTrackOriginal = document.createElement("span");
                nodeAudioTrackOriginal.classList.add("format-item__original");
                nodeAudioTrackOriginal.textContent = "ORIGINAL";
                nodeAudioTrackWrapper.appendChild(nodeAudioTrackOriginal);

                if (!nodeFormatItem.classList.contains("format-original")) {
                    nodeFormatItem.classList.add("format-original");
                }
            }

            nodeFormatItem.appendChild(nodeAudioTrackWrapper);
        }

        if (format.averageBitrate > 0) {
            const nodeBitrate = document.createElement("span");
            nodeBitrate.textContent = `~${(format.averageBitrate / 1024).toFixed(3)} Kbps`;
            nodeFormatItem.appendChild(nodeBitrate);
        }

        if (format.contentLength > 0) {
            const nodeContentLength = document.createElement("span");
            nodeContentLength.textContent = formatSize(format.contentLength);
            nodeFormatItem.appendChild(nodeContentLength);
        }
    });

    const nodeGroupTitle = document.createElement("h3");
    nodeGroupTitle.textContent = `${getGroupTitle(groupName)}:`;

    const nodeGroup = document.createElement("div");
    nodeGroup.appendChild(nodeGroupTitle);
    nodeGroup.appendChild(nodeGroupItemList);

    return nodeGroup;
}

function createOtherGroup(json) {
    const nodeGroupOther = createGroup([]);
    const styles = getItemStyles();

    if (json.raw_video_info) {
        const node = document.createElement("div");
        styles.forEach(styleName => node.classList.add(styleName));
        node.textContent = "Copy raw data";
        node.addEventListener("click", () => {
            if (!navigator.clipboard) {
                alert("Ошибка! Невозможно получить доступ к буферу обмена! Информация выведена в консоль!");
                console.log(json.raw_video_info);
                return;
            }
            navigator.clipboard.writeText(JSON.stringify(json.raw_video_info));
        });
        nodeGroupOther.lastChild.appendChild(node);
    }

    if (json.video_info) {
        const node = document.createElement("div");
        styles.forEach(styleName => node.classList.add(styleName));
        node.textContent = "Copy parsed data";
        node.addEventListener("click", () => {
            if (!navigator.clipboard) {
                alert("Ошибка! Невозможно получить доступ к буферу обмена! Информация выведена в консоль!");
                console.log(json.video_info);
                return;
            }
            navigator.clipboard.writeText(JSON.stringify(json.video_info));
        });
        nodeGroupOther.lastChild.appendChild(node);
    }

    if (json.player_url) {
        const node = document.createElement("a");
        styles.forEach(styleName => node.classList.add(styleName));
        node.textContent = "Open player code";
        node.setAttribute("href", json.player_url);
        node.setAttribute("target", "_blank");
        nodeGroupOther.lastChild.appendChild(node);
    }

    return nodeGroupOther;
}

function getItemStyles(groupName) {
    switch (groupName) {
        case "Video":
            return ["format-list__format-item", "format-item__video"];

        case "Audio":
            return ["format-list__format-item", "format-item__audio"];

        case "Container":
            return ["format-list__format-item", "format-item__container"];
    }

    return ["format-list__format-item", "format-item__other"];
}

function getGroupTitle(groupName) {
    switch (groupName) {
        case "Video":      return "Адаптивные форматы видео";
        case "Audio":      return "Адаптивные форматы аудио";
        case "Container":  return "Контейнерные форматы";
        default:           return "Другое";
    }
}

function getFixedFileExtension(mediaType, extension, isContainer) {
    if (isContainer) { return "mp4"; }
    else if (extension) {
        switch (mediaType) {
            case "video":
                return extension === "mp4" ? "m4v" : extension;

            case "audio":
                switch (extension) {
                    case "webm": return "weba";
                    case "mp4":  return "m4a";
                    default:     return extension;
                }
        }
    }

    return "dat";
}

function formatTime(date) {
    const h = date.getUTCHours();
    const m = date.getUTCMinutes();
    const s = date.getUTCSeconds();
    const seconds = h * 3600 + m * 60 + s;
    return [seconds > 0 ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}` : "0:00:00", seconds];
}

function extractThumbnailFileName(thumbnailUrl) {
    let matchFileName = /\/vi(?:_webp)?\/.{11}\/([^\&\?\\\/]+\.\w{3,4})/.exec(thumbnailUrl);
    if (!matchFileName) { matchFileName = /\/img\/(.*\.png$)/.exec(thumbnailUrl); }
    return matchFileName?.length > 1 ? matchFileName[1] : null;
}

function formatSize(n) {
    return `${n} bytes`;
}

async function getVideoInfo(videoId, apiClientName, getDownloadUrls, cookies, useCookies) {
    try {
        let response;
        const requestedData = ["raw_video_info", "parsed_video_info"];
        if (getDownloadUrls) { requestedData.push("urls"); }
        const requestedDataString = requestedData.join(",");
        if (useCookies) {
            const jBody = {
                "video_id": videoId,
                "api_client_name": clientSelector.value ? clientSelector.value : "auto",
                "requested_data": requestedDataString,
                "cookies": cookies
            };
            const bodyStringified = JSON.stringify(jBody);
            const bodyBuffer = Uint8Array.from(bodyStringified);
            const options = {
                "method": "POST",
                "body": bodyStringified,
                "Content-Type": "application/json",
                "Content-Length": bodyBuffer.length.toString()
            };

            const url = "/api/get_video_info";
            response = await fetch(url, options);
        } else {
            const query = new URLSearchParams();
            query.append("video_id", videoId);
            query.append("api_client_name", apiClientName);
            query.append("requested_data", requestedDataString);

            const url = `/api/get_video_info?${query}`;
            response = await fetch(url);
        }

        return [response.status, await response.json()];
    } catch (e) {
        console.log(e);
        return [-1, e.message];
    }
}

function searchRegularExpression(regularExpressionArray, inputString) {
    for (let i = 0; i < regularExpressionArray.length; ++i) {
        const m = regularExpressionArray[i].exec(inputString);
        if (m?.length > 1) { return m[1]; }
    }
}

function extractVideoIdFromUrl(url) {
    const m = searchRegularExpression([
        /^http(?:s)?:\/\/(?:www\.)?youtube\.com\/watch.*(?:\?|\&)v=([\w\d\-]{11})/,
        /^http(?:s)?:\/\/(?:www\.)?youtu\.be\/([\w\d\-]{11})[\?\&]?/,
        /^http(?:s)?:\/\/(?:www\.)?youtube\.com\/shorts\/([\w\d\-]{11})$/
    ], url);
    return m;
}

function tryParseCookies() {
    return tryParseJson(textareaCookies.value);
}

function tryParseJson(jsonString) {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        console.log(e);
        return null;
    }
}

function clearChildNodes(node) {
    while (node.firstChild) { node.removeChild(node.firstChild); }
}

function showError(message) {
    if (typeof(message) !== "string") { message = "Unshowable demonic error is occurred!"; }
    nodeErrorMessage.textContent = message;
    nodeErrorMessage.style.display = message ? "block" : "none";
}

function enableControls(enabled) {
    btnSearch.disabled =
    inputUrl.disabled =
    checkBoxGetUrls.disabled =
    clientSelector.disabled =
    checkBoxUseCookies.disabled =
    textareaCookies.disabled =
    btnSendDefaultCookies.disabled =
    btnClearDefaultCookies.disabled = !enabled;
}

(async () => {
    const urlParameters = new URLSearchParams(window.location.search);
    const inputValue = urlParameters.get("input");
    if (inputValue) { inputUrl.value = decodeURIComponent(inputValue); }
    const storedCookies = localStorage.getItem("cookies");
    if (storedCookies) { textareaCookies.value = storedCookies; }

    const response = await fetch("/api/get_yt_client_list");
    clientSelector.parentNode.childNodes[clientSelector.parentNode.childNodes.length - 2].style.display = "none";
    if (response.status === 200) {
        const clients = await response.json();
        for (const key in clients) {
            const nodeOption = document.createElement("option");
            nodeOption.value = clients[key].id;
            nodeOption.textContent = clients[key].display_name;
            nodeOption.setAttribute("supports_cookies", clients[key].supports_cookies);
            clientSelector.appendChild(nodeOption);
        };

        btnSearch.disabled = false;
    } else {
        const t = "Can't get YouTube client list!";
        showError(t);
        alert(t);
    }
})();
