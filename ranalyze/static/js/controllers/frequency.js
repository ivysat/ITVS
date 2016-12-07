(function(app){
"use strict";

    var frequencyController = function($scope, $rootScope, config, models, tabs) {

        var ctrl = this,
        blacklistPromise, blacklist = [],
        entryPromise = config.getEntryWeight().then(function success(item) {
            ctrl.frequency.params.entryWeight = item.value;
        }, function failure(){
            $scope.$emit('ranalyze.error', {
                textContent: "Couldn't get cloud parameter `entryWeight` from server."
            });
        }),
        totalPromise = config.getTotalWeight().then(function success(item) {
            ctrl.frequency.params.totalWeight = item.value;
        }, function failure(){
            $scope.$emit('ranalyze.error', {
                textContent: "Couldn't get cloud parameter `totalWeight` from server."
            });
        }),
        updateBlacklist = function() {
            blacklistPromise = config.getBlacklist().then(function success(items) {
                blacklist = items.map(function (item) {
                    return item.value;
                });
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
                    var _update = function () {
                        ctrl.cloud.words = ctrl.frequency.words.filter(function(word) {
                            return !blacklist.includes(word.text);
                        });
                        // Deep copy to trigger cloud update
                        ctrl.cloud.words = angular.copy(ctrl.cloud.words);
                    };
                    blacklistPromise.then(_update);
                }
            },
            frequency: {
                params: {
                    date_before: new Date(),
                    date_after: new Date()
                },
                selectedWords: [],
                words: [],
                updateWeights: function(){
                    var _updateWeights = function(){
                        var entryWeight = ctrl.frequency.params.entryWeight,
                        totalWeight = ctrl.frequency.params.totalWeight;
                        for (var i=0,j=ctrl.frequency.words.length,word;i<j;i++) {
                            word = ctrl.frequency.words[i];
                            word.weight = entryWeight * word.entries + totalWeight * word.total;
                        }
                        ctrl.cloud.update();
                    };
                    // Ensure all promises are resolved
                    entryPromise.then(function(){
                        totalPromise.then(_updateWeights);
                    });
                },
                updateWords: function() {
                    models.Frequency.getOverview({
                        gran: models.Frequency.granularity.DAY,
                        limit: 150,
                        year_before: ctrl.frequency.params.date_before.getFullYear(),
                        month_before: ctrl.frequency.params.date_before.getMonth()+1,
                        day_before: ctrl.frequency.params.date_before.getDate(),

                        year_after: ctrl.frequency.params.date_after.getFullYear(),
                        month_after: ctrl.frequency.params.date_after.getMonth()+1,
                        day_after: ctrl.frequency.params.date_after.getDate()
                    }).then(function success(data){
                        ctrl.frequency.words = data.map(function(item){
                            return {
                                text: item.word,
                                entries: item.entries,
                                total: item.total,
                                html: {
                                    class: 'clickable'
                                },
                                handlers: {
                                    "click": function() {
                                        $rootScope.$apply(function(){
                                            ctrl.search(item.word);
                                        });
                                    }
                                }
                            };
                        });
                        ctrl.frequency.updateWeights();
                    }, function failure(){
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
                $rootScope.$broadcast('ranalyze.search', {
                    query: word,
                    after: ctrl.frequency.params.date_after,
                    before: ctrl.frequency.params.date_before,
                    advanced: false,
                    subreddit: []
                });
            }
        });

        $scope.$on('ranalyze.cloudConfig.change', function(event, newConfig){
            angular.extend(ctrl.frequency.params, newConfig.params);
            blacklist = newConfig.blacklist;
            ctrl.frequency.updateWeights();
        });

        updateBlacklist();

        ctrl.frequency.updateWords();

    };

    app.controller('frequencyController', frequencyController);

})(app);