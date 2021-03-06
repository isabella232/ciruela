require('rootpath')();
var colors      = require('colors');
var exec        = require('child_process').exec;
var mailer      = require('lib/mailer');
var git         = require('lib/git');
var jobs        = require('lib/jobs');
var help        = require('lib/help');
var fs          = require('fs');
var postHook    = require('lib/post-hook');

var runner = module.exports = {
    build: function (target) {
        runNextJob(target);
    }
};

var runNextJob = function (target) {
    console.log("buiding target " + target.branch + " - " + target.commit.id);
    var runAllTaks = function () {
        console.log("Executing tasks".grey);
        git.fetch(target, function () {
            git.checkout(target, function() {
                //git.pull(target, function() {
                    npm.rm(function () { // remove all packages for a fresh install
                        npm.install(function () {
                            // npm.update(function () { // usefull when updating packages from a branch to another
                                runTests(target, function (test_results) {
                                    runCoverage(target, function () {
                                        runLint(target, function (lint_results) {
                                            processResults(target, test_results, lint_results, function (success) {
                                                jobs.currentComplete(success, function () {
                                                    runNextJob(target);
                                                });
                                            });
                                        });
                                    });
                                });
                            // });
                        });
                    });
                //});
            });
        });
    };

    if (jobs.current) {
        console.log("Current running job id: " + jobs.current);
        return false;
    }
    console.log("Running next job");
    jobs.next(function (_target) {
        console.log("Starting job");
        git.start(_target, function (preparedTarget, ready) {
            target = preparedTarget;
            if (ready) {
                runAllTaks();
            } else {
                git.clone(target, function () {
                    runAllTaks();
                });
            }
        });
    });
};

var runTests = function(target, callback) {
    console.log("Executing tests".grey);
    console.log("Moving to: " + target.name);
    process.chdir(target.name);
    jobs.updateJob(jobs.current, "Executing '" + git.runner + "'");
    exec(git.runner, {
        maxBuffer: 1024 * 1024
    }, function (error, stdout, stderr) {
        if (error) console.log("Error on runTests", error);
        callback({
            error: error,
            stdout: stdout,
            stderr: stderr
        });
    });
};

var runCoverage = function (target, callback) {
    var reportFolder = config.reportsDirectory + '/' + target.repoName;
    var output = ' HTML_FILE=' + reportFolder + '/' + target.commit.id + '.html';
    console.log("Creating coverage file".white);
    exec("mkdir -p " + reportFolder, function (err, stdout, stderr) {
        if (err) {
            callback(err);
        } else {
            exec(git.coverage + '' + output, function (error, stdout, stderr) {
                console.log(stdout);
                console.log(stderr);
                callback();
            });
        }
    });
};

var runLint = function (target, callback) {
    console.log("Running JSHint".white);
    console.log("Moving to: " + target.projectRoot);
    process.chdir(target.projectRoot);
    exec(git.lint({
        target: target
    }), {
        maxBuffer: 1024 * 1024
    }, function (error, stdout, stderr) {
        if (error) console.log("Error on runLint", error);
        results = JSON.parse(stdout);
        console.log("Moving to: " + target.name);
        process.chdir(target.name);
        callback(results);
    });
};

var processResults = function (target, tests, lint_results, callback) {
    console.log("Processing results".grey);

    var updateJobAndSendError = function () {
        jobs.updateJob(jobs.current, results, function () {
            out = tests.error || tests.stderr;
            console.log("Sending error mail");
            mailer.processError(out, lint_results, results, target);
            console.log("Moving to: " + target.projectRoot);
            process.chdir(target.projectRoot);
            callback(false);
        });
    }
    var updateJobAndSendBuildResults = function() {
        jobs.updateJob(jobs.current, results, function () {
            jobs.getAverageDuration(target, function (obj) {
                if (!obj) console.log("Did not found an average runtime".red);
                jobs.compareDuration(obj.averageTime, results.stats.duration, function (decrease, percentage) {
                    results['decrease'] = decrease;
                    results['decreasePercentage'] = percentage;
                    mailer.buildMail(target, lint_results, results, function (builtResult) {
                        console.log("Sending build results");
                        mailer.sendBuildResult(builtResult);
                    });
                    console.log("Executing post hook for deployable package");
                    console.log("Moving to: " + target.projectRoot);
                    process.chdir(target.projectRoot);
                    postHook.createDeployablePackage(target, lint_results, results, function (error, stdout, stderr) {
                        console.log("Finished post hook for deployable package");
                        if (error) {
                            console.log(error);
                        }
                        callback(true);
                    });
                });
            });
        });
    }

    if (tests.error) {
        console.log("Error - GIT Runner".red);
        console.log(tests.error);
        console.log("STDERR");
        console.log(tests.stderr);

        try {
            results = JSON.parse(tests.stdout);
            updateJobAndSendError();
        } catch (err) {
            console.log("Exception Error".red);
            console.log(err);
            console.log(target.name);
            console.log(target.branch);
            console.log(target.commit.id);
            results = {stats: {}, failures: []};
            // npm.clean(function () {
                // console.log("npm Cleaned".yellow);
            updateJobAndSendError();
            // })
        } finally {
            console.log("STDOUT");
            console.log(tests.stdout);
        }

    } else {
        console.log("Preparing report".grey);
        try {
            results = JSON.parse(tests.stdout);
            updateJobAndSendBuildResults()
        } catch (err) {
            console.log("STDOUT");
            console.log(tests);
            console.log(tests.stdout);
            results = {stats: {}, failures: []};
            updateJobAndSendError();
        }
    }
}
