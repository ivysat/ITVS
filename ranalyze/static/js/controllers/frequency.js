(function(app){
"use strict";

    var frequencyController = function($scope, $q, $rootScope, datesInOrder, models, tabs) {

        var ctrl = this,
        blacklistPromise, blacklist = [],
        entryPromise = models.Config.getEntryWeight().then(function success(item) {
            ctrl.frequency.params.entryWeight = item.value;
        }, function failure(){
            $scope.$emit('ranalyze.error', {
                textContent: "Couldn't get cloud parameter `entryWeight` from server."
            });
        }),
        totalPromise = models.Config.getTotalWeight().then(function success(item) {
            ctrl.frequency.params.totalWeight = item.value;
        }, function failure(){
            $scope.$emit('ranalyze.error', {
                textContent: "Couldn't get cloud parameter `totalWeight` from server."
            });
        }),
        updateBlacklist = function() {
            blacklistPromise = models.Config.getBlacklist().then(function success(items) {
                blacklist = items;
            }, function failure() {
                $scope.$emit('ranalyze.error', {
                    textContent: "Couldn't get cloud parameter `blacklist` from server."
                });
            });
        };

        angular.extend(ctrl, {
            cloud: {
                words: [],
                update: function(){
                    blacklistPromise.then(function () {
                        ctrl.cloud.words = ctrl.frequency.words.filter(function(word) {
                            return !ctrl.frequency.inBlacklist(word.text);
                        });
                        // Deep copy to trigger cloud update
                        ctrl.cloud.words = angular.copy(ctrl.cloud.words);
                    });
                }
            },
            frequency: {
                blacklistSelected: function(){
                    var promises = ctrl.frequency.selectedWords.map(function(word){
                        return ctrl.frequency.inBlacklist(word.text) ? $q.reject(word) :
                            models.Config.addToBlacklist(word.text).then(function success(item){
                            blacklist.push(item);
                        });
                    });
                    $q.all(promises).then(function success(){
                        ctrl.frequency.selectedWords = [];
                    }, function failure(){
                        $scope.$emit('ranalyze.error', {
                            textContent: 'An error occurred while trying to add words to the blacklist'
                        });
                    }).finally(ctrl.cloud.update);;
                },
                unblacklistSelected: function(){
                    var promises = ctrl.frequency.selectedWords.map(function(word){
                        var configItem;
                        angular.forEach(blacklist, function(item) {
                            if (item.value === word.text) {
                                configItem = item;
                            }
                        });
                        return configItem ? configItem.delete().then(function success(){
                            blacklist.splice(blacklist.indexOf(configItem), 1);
                        }) : $q.reject(word);
                    });
                    $q.all(promises).then(function success(){
                        ctrl.frequency.selectedWords = [];
                    }, function failure(){
                        $scope.$emit('ranalyze.error', {
                            textContent: 'An error occurred while trying to remove words from the blacklist'
                        });
                    }).finally(ctrl.cloud.update);;
                },
                checkDates: function(){
                    ctrl.frequency.params.valid = datesInOrder(ctrl.frequency.params.after, ctrl.frequency.params.before);
                    return ctrl.frequency.params.valid;
                },
                inBlacklist: function(word) {
                    var found = false;
                    word = word.toLowerCase();
                    angular.forEach(blacklist, function(item) {
                        found |= item.value === word;
                    });
                    return !!found;
                },
                lastDateRange: {},
                params: {
                    before: (function tomorrow(){
                        var date = new Date();
                        date.setDate(date.getDate() + 1);
                        date.setHours(0,0,0,0);
                        return date;
                    })(),
                    after: (function today(){
                        var date = new Date();
                        date.setHours(0,0,0,0);
                        return date;
                    })(),
                    valid: true
                },
                selectedWords: [],
                words: [],
                updateWeights: function(){
                    // Ensure all promises are resolved
                    $q.all([entryPromise, totalPromise]).then(function success(){
                        var entryWeight = ctrl.frequency.params.entryWeight,
                        totalWeight = ctrl.frequency.params.totalWeight;
                        for (var i=0,j=ctrl.frequency.words.length,word;i<j;i++) {
                            word = ctrl.frequency.words[i];
                            word.weight = entryWeight * word.entries + totalWeight * word.total;
                        }
                        ctrl.cloud.update();
                    });
                },
                updateWords: function() {
                    models.Frequency.getOverview({
                        gran: models.Frequency.granularity.DAY,
                        limit: 150,
                        year_before: ctrl.frequency.params.before.getFullYear(),
                        month_before: ctrl.frequency.params.before.getMonth() + 1,
                        day_before: ctrl.frequency.params.before.getDate(),

                        year_after: ctrl.frequency.params.after.getFullYear(),
                        month_after: ctrl.frequency.params.after.getMonth() + 1,
                        day_after: ctrl.frequency.params.after.getDate()
                    }).then(function success(data) {
                        ctrl.frequency.lastDateRange = {
                            before: ctrl.frequency.params.before,
                            after: ctrl.frequency.params.after
                        };
                        ctrl.frequency.words = data.map(function (item) {
                            return {
                                text: item.word,
                                entries: item.entries,
                                total: item.total,
                                html: {
                                    class: 'clickable'
                                },
                                handlers: {
                                    "click": function () {
                                        $rootScope.$apply(function () {
                                            ctrl.search(item.word);
                                        });
                                    }
                                }
                            };
                        });
                        ctrl.frequency.updateWeights();
                    }, function failure() {
                        $scope.$emit('ranalyze.error', {
                            textContent: "Couldn't get word frequency from server."
                        });
                    });
                },
                table: {
                    limit: 10,
                    limitOptions: [10, 25, 50, 100],
                    order: "-weight",
                    page: 1
                }
            },
            search: function(word) {
                tabs.setTab(0);
                $rootScope.$broadcast('ranalyze.search', angular.extend({
                    query: word,
                    advanced: false,
                    subreddit: []
                }, ctrl.frequency.lastDateRange));
            }
        });

        $scope.$on('ranalyze.cloudConfig.change', function(event, newConfig){
            newConfig = newConfig || {};
            angular.extend(ctrl.frequency.params, newConfig.params);
            blacklist = newConfig.blacklist || blacklist;
            ctrl.frequency.updateWeights();
        });

        updateBlacklist();

        ctrl.frequency.updateWords();


    };

    app.controller('frequencyController', frequencyController);

})(app);