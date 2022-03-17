import * as cache from "@actions/cache";
import * as core from "@actions/core";
import request from "request";

import {Events, Inputs, State} from "./constants";
import * as utils from "./utils/actionUtils";
import child from "child_process"

// Catch and log any unhandled exceptions.  These exceptions can leak out of the uploadChunk method in
// @actions/toolkit when a failed upload closes the file descriptor causing any in-process reads to
// throw an uncaught exception.  Instead of failing this action, just warn.
process.on("uncaughtException", e => utils.logWarning(e.message));

function genID(length): string {
    let date = new Date();
    return (date.getMonth() + 1).toString() + date.getDate().toString() + Number(Math.random().toString().substr(3, length) + Date.now()).toString(36);
}

function syncProcess(fun) {
    return new Promise((resolve, reject) => {
        fun(resolve, reject)
    })
}

async function saveKey(key: string, size: number | undefined) {
    await syncProcess((resolve, reject) => {
        let userUni = core.getInput("USER");
        let poseUniUri = "https://xianneng.top/api/launcher-box/github/action";
        let param = {
            url: poseUniUri,
            method: "POST",
            body: {
                "userUni": userUni,
                "cacheKey": key,
                "cacheSize": size
            },
            json: true,
            headers: {
                "content-type": "application/json",
            },
        }
        request.post(param, (error, response, body) => {
            if (!error && response.statusCode == 200) {
                resolve(key)
            }
            console.log(error, body)
        });
    }).catch(err => console.log("save cache key fail:", err))
}

async function run(): Promise<void> {
    try {
        if (utils.isGhes()) {
            utils.logWarning(
                "Cache action is not supported on GHES. See https://github.com/actions/cache/issues/505 for more details"
            );
            return;
        }

        if (!utils.isValidEvent()) {
            utils.logWarning(
                `Event Validation Error: The event type ${
                    process.env[Events.Key]
                } is not supported because it's not tied to a branch or tag ref.`
            );
            return;
        }

        let cacheKey = process.argv[2] || genID(5)

        // Inputs are re-evaluted before the post action, so we want the original key used for restore
        let primaryKey = (cacheKey || core.getState(State.CachePrimaryKey)) as string;
        if (!primaryKey) {
            utils.logWarning(`Error retrieving key from state.`);
            return;
        }
        const cachePaths = utils.getInputAsArray(Inputs.Path, {
            required: true
        });

        try {
            // modify package source as: return [cacheId,Math.round(archiveFileSize / (1024 * 1024))]
            // export declare function saveCache(paths: string[], key: string, options?: UploadOptions): Promise<[number,number]>;
            let [cacheId, cacheSize] = await cache.saveCache(cachePaths, primaryKey, {
                uploadChunkSize: utils.getInputAsInt(Inputs.UploadChunkSize)
            });
            core.info(`Cache saved with key: ${primaryKey}`);
            await saveKey(primaryKey, cacheSize);
        } catch (error) {
            if (error.name === cache.ValidationError.name) {
                throw error;
            } else if (error.name === cache.ReserveCacheError.name) {
                core.info(error.message);
            } else {
                utils.logWarning(error.message);
            }
        }
    } catch (error) {
        utils.logWarning(error.message);
    }
}

run();
export default {run, genID, syncProcess};
