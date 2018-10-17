/*
    This file is part of web3.js.

    web3.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    web3.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * @file Subscription.js
 * @authors: Samuel Furter <samuel@ethereum.org>
 * @date 2018
 */

"use strict";

var _ = require('underscore');
var EventEmitter = require('eventemitter3');

/**
 * @param {AbstractSubscriptionModel} subscriptionModel
 * @param {AbstractWeb3Module} moduleInstance
 *
 * @constructor
 */
function Subscription(subscriptionModel, moduleInstance) {
    this.subscriptionModel = subscriptionModel;
    this.moduleInstance = moduleInstance;
    this.subscriptionId = null;
}

Subscription.prototype = Object.create(EventEmitter.prototype);
Subscription.prototype.constructor = Subscription;

/**
 * Sends the JSON-RPC request, emits the required events and executes the callback method.
 *
 * @method subscribe
 *
 * @param {Function} callback
 *
 * @callback callback callback(error, result)
 * @returns {Subscription} Subscription
 */
Subscription.prototype.subscribe = function (callback) {
    var self = this;

    this.subscriptionModel.beforeSubscription(this, this.moduleInstance, callback);

    this.moduleInstance.currentProvider.subscribe(
        this.subscriptionModel.subscriptionType,
        this.subscriptionModel.subscriptionMethod,
        [this.subscriptionModel.options]
    ).then(function (subscriptionId) {
        self.subscriptionId = subscriptionId;

        self.moduleInstance.currentProvider.on(self.subscriptionId, function (error, response) {
            if (!error) {
                self.handleSubscriptionResponse(response, callback);

                return;
            }

            if (self.moduleInstance.currentProvider.once) {
                self.reconnect(callback);
            }

            if (_.isFunction(callback)) {
                callback(error, null);
            }

            self.emit('error', error);
        });
    });

    return this;
};

/**
 * Iterates over each item in the response, formats the output, emits required events and executes the callback method.
 *
 * @method handleSubscriptionResponse
 *
 * @param {*} response
 * @param {Function} callback
 *
 * @callback callback callback(error, result)
 */
Subscription.prototype.handleSubscriptionResponse = function (response, callback) {
    if (!_.isArray(response)) {
        response = [response];
    }

    response.forEach(function (item) {
        var formattedOutput = this.subscriptionModel.onNewSubscriptionItem(this, item);

        this.emit('data', formattedOutput);

        if (_.isFunction(callback)) {
            callback(false, formattedOutput);
        }
    });
};

/**
 * TODO: The reconnecting handling should only be in the provider the subscription should not care about it.
 * Reconnects provider and restarts subscription
 *
 * @method reconnect
 *
 * @param {Function} callback
 *
 * @callback callback callback(error, result)
 */
Subscription.prototype.reconnect = function (callback) {
    var self = this;

    var interval = setInterval(function () {
        if (self.moduleInstance.currentProvider.reconnect) {
            self.moduleInstance.currentProvider.reconnect();
        }
    }, 500);

    this.moduleInstance.currentProvider.once('connect', function () {
        clearInterval(interval);
        self.unsubscribe().then(function () {
            self.subscribe(callback);
        }).catch(function (error) {
            self.emit('error', error);

            if(_.isFunction(callback)) {
                callback(error, null);
            }
        });
    });
};

/**
 * Unsubscribes subscription
 *
 * @method unsubscribe
 *
 * @param {Function} callback
 *
 * @callback callback callback(error, result)
 * @returns {Promise<boolean>}
 */
Subscription.prototype.unsubscribe = function (callback) {
    var self = this;
    return this.moduleInstance.currentProvider.unsubscribe(
        this.subscriptionId,
        this.subscriptionModel.subscriptionType
    ).then(function (response) {
        self.removeAllListeners('data');
        self.removeAllListeners('error');

        if (!response) {
            self.subscriptionId = null;

            if(_.isFunction(callback)) {
                callback(true, false);
            }

            return true;
        }

        if (_.isFunction(callback)) {
            callback(false, true);
        }

        return false;
    });
};

module.exports = Subscription;