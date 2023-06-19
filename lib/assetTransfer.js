/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

// Deterministic JSON.stringify()
const stringify  = require('json-stringify-deterministic');
const sortKeysRecursive  = require('sort-keys-recursive');
const { Contract } = require('fabric-contract-api');

class AssetTransfer extends Contract {

    async InitLedger(ctx) {
        const userInfos = [
            // 示例
            // {
            //     ID: '10',
            //     name: '李晓康',
            //     stuNum: '191250075',
            //     acValue: 0.0,
            // },
        ];

        // 每个用户ac值的变更历史<id, string[]>
        const historyMap = new Map();
        for (const userInfo of userInfos) {
            // example of how to write to world state deterministically
            // use convetion of alphabetic order
            // we insert data in alphabetic order using 'json-stringify-deterministic' and 'sort-keys-recursive'
            // when retrieving data, in any lang, the order of data will be the same and consequently also the corresonding hash
            await ctx.stub.putState(userInfo.ID, Buffer.from(stringify(sortKeysRecursive(userInfo))));
        }

        for (let [key, value] of historyMap) {
            await ctx.stub.putState(key + '_historyLog', Buffer.from(stringify(sortKeysRecursive(value))));
        }
    }

    // 新建一个UserInfo
    async CreateUserInfo(ctx, id, name, stuNum, acValue, insertTime) {
        const exists = await this.UserInfoExists(ctx, id);
        if (exists) {
            throw new Error(`The userInfo ${id} already exists`);
        }

        const userInfo = {
            ID: id,
            name: name,
            stuNum: stuNum,
            acValue: acValue,
        };
        // we insert data in alphabetic order using 'json-stringify-deterministic' and 'sort-keys-recursive'
        await ctx.stub.putState(id, Buffer.from(stringify(sortKeysRecursive(userInfo))));
        await this.AddHistory(ctx, id, '初始化', '=' + acValue, insertTime);
        return JSON.stringify(userInfo);
    }

    // 读取UserInfo
    async ReadUserInfo(ctx, id) {
        const assetJSON = await ctx.stub.getState(id); // get the asset from chaincode state
        if (!assetJSON || assetJSON.length === 0) {
            throw new Error(`The userInfo ${id} does not exist`);
        }
        return assetJSON.toString();
    }

    // 记录AC变更
    async AcChange(ctx, id, acChange, reason, insertTime) {
        const exists = await this.UserInfoExists(ctx, id);
        if (!exists) {
            throw new Error(`The userInfo ${id} does not exist`);
        }
        let olderUserInfo = JSON.parse(await this.ReadUserInfo(ctx, id));
        // overwriting original asset with new asset
        const newUserInfo = {
            ID: olderUserInfo.ID,
            name: olderUserInfo.name,
            stuNum: olderUserInfo.stuNum,
            acValue: (parseFloat(olderUserInfo.acValue) + parseFloat(acChange)).toString(),
        };
        await this.AddHistory(ctx, id, reason, (parseFloat(acChange) >= 0)? ('+' + parseFloat(acChange)) : (acChange), insertTime);
        // we insert data in alphabetic order using 'json-stringify-deterministic' and 'sort-keys-recursive'
        await ctx.stub.putState(id, Buffer.from(stringify(sortKeysRecursive(newUserInfo))));
        return JSON.stringify(newUserInfo);
    }


    // 查看UserInfo是否存在
    async UserInfoExists(ctx, id) {
        const assetJSON = await ctx.stub.getState(id);
        return assetJSON && assetJSON.length > 0;
    }


    // GetAllAssets returns all assets found in the world state.
    async GetAllAssets(ctx) {
        const allResults = [];
        // range query with empty string for startKey and endKey does an open-ended query of all assets in the chaincode namespace.
        const iterator = await ctx.stub.getStateByRange('', '');
        let result = await iterator.next();
        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
            } catch (err) {
                console.log(err);
                record = strValue;
            }
            allResults.push(record);
            result = await iterator.next();
        }
        return JSON.stringify(allResults);
    }
    // 查询某个User的ac变动记录
    async GetHistory(ctx, userId) {
        const assetJSON = await ctx.stub.getState(userId + '_historyLog'); // get the asset from chaincode state
        if (!assetJSON || assetJSON.length === 0) {
            throw new Error(`The userInfo ${userId}'s history does not exist`);
        }
        return assetJSON.toString();
    }
    // 读取UserInfo（重复了）
    async GetUserInfo(ctx, userId) {
        const assetJSON = await ctx.stub.getState(userId); // get the asset from chaincode state
        if (!assetJSON || assetJSON.length === 0) {
            throw new Error(`The userInfo ${userId}'s history does not exist`);
        }
        return assetJSON.toString();
    }
    // 新建AC变动历史记录
    async AddHistory(ctx, userId, reason, acChange, insertTime) {
        let assetJSON = await ctx.stub.getState(userId + '_historyLog'); // get the asset from chaincode state
        if (!assetJSON || assetJSON.length === 0) {
            // throw new Error(`The userInfo ${userId}'s history does not exist`);
            assetJSON='[]';
        }
        let oldHistory = JSON.parse(assetJSON.toString());
        let newHistory =[...oldHistory];
        newHistory.push({
            reason: reason,
            acChange: 'ac' + acChange,
            insertTime: insertTime
        });
        await ctx.stub.putState(userId + '_historyLog', Buffer.from(stringify(sortKeysRecursive(newHistory))));
    }
}

module.exports = AssetTransfer;
