var spawn = require('child_process').spawn;
var semver = require('semver');
var $ = global.window.$;
var Promise = global.window.Promise;

/**
 * Factory method to create a Chatterfox NwGuiContext from the supplied gui
 * @param {nw.gui} gui context
 * @returns {NwGuiContext}
 */
function fromNwGui(gui) {
    return new NwGuiContext(gui);
}

function NwGuiContext(gui) {
    this.gui = gui;

    this.platform = process.platform;
    this.processPath = process.execPath;
    this.manifest = gui.App.manifest;
    this.launchArgs = gui.App.argv;

    var protocol = this.manifest.cfUrl.substr(0, this.manifest.cfUrl.indexOf("://")) + "://";
    this.versionUrl = protocol + this.manifest.versionUrl;

    if (!(this.launchArgs.indexOf("--no-cache-clear") > -1)) {
        console.log("Clear cache!");
        this.clearCache();
    }
}

NwGuiContext.prototype.quit = function () {
    this.gui.App.quit();
};

NwGuiContext.prototype.clearCache = function () {
    var self = this;

    // NOTE: Needed since executing this code instantly will lock the application on restart
    setTimeout(function () {
        self.gui.App.clearCache();
    }, 2000);
};

NwGuiContext.prototype.respawn = function () {
    var child;

    if (this.platform == "darwin") {
        child = spawn("open", ["-n", "-a", this.processPath.match(/^([^\0]+?\.app)\//)[1]], {detached: true, stdio: 'ignore'});
    } else {
        child = spawn(this.processPath, ['--no-cache-clear'], {detached: true, stdio: 'ignore'});
    }

    child.unref();

    this.gui.App.quit();
};

NwGuiContext.prototype.showUpdateInstructions = function () {
    this.gui.Shell.openExternal(this.manifest.upgradeUrl);
    this.gui.App.closeAllWindows();
};

NwGuiContext.prototype.checkServerStatus = function () {
    var self = this;

    return new Promise(function (resolve, reject) {
        var attempts = 0;

        function tryServerPing() {
            attempts++;

            $.ajax({
                type: "HEAD",
                async: true,
                url: self.manifest.cfUrl + "/api/",
                timeout: 5000,
                success: resolve,
                error: function () {
                    attempts <= 6 ? setTimeout(tryServerPing, 5000) : reject();
                }
            });
        }

        tryServerPing();
    });
};

NwGuiContext.prototype.checkApplicationVersion = function () {
    var manifest = this.manifest;
    var versionUrl = this.versionUrl;

    return new Promise(function (resolve, reject) {

        function determineVersion(data) {
            if (!data || !data.version) {
                resolve(null);
                return;
            }

            var diff = semver.diff(manifest.version, data.version);

            diff ? reject({type: diff, newVersion: data.version, currentVersion: manifest.version}) : resolve(diff);
        }

        function ignoreVersion() {
            resolve(null);
        }

        $.ajax({
            type: "GET",
            async: true,
            dataType: 'json',
            cache: 'false',
            url: versionUrl + '?' + new Date().getTime(),
            timeout: 5000,
            success: determineVersion,
            error: ignoreVersion
        });
    })
};

module.exports.fromNwGui = fromNwGui;