require('rootpath')();
exec = require('child_process').exec;
colors = require('colors');
npm = require('lib/npm');
help = require('lib/help');
readyCallback = null;

git = module.exports = {
	runner: 'make test-ciruela',
	branch: '',
	user: '',

	start: function(target, callback) {
	    help.prepare(target, function (prepared) {
	    	setBranch(target);
		    callback(prepared);
	    });
  	},

	fetch: function(target, callback) {
		exec('git fetch && git reset --hard origin/' + git.branch, function(error, stdout, stderr) {
			if (error != null) {
	  			out = "" + error;
	  			return console.log(out.red);
			} else {
				out = "Updating '" + git.branch + "' branch";
	  			console.log(out.grey);
				npm.deploy(function() {
					return callback();
				});
			}
    	});
	},

	clone: function(target, callback) {
		var jobs, out;
		out = "Cloning '" + target.repoName + "' repository";
		console.log(out.grey);
		
		var cmd = 'git clone ' + target.url + ' ' + target.name;
    	exec(cmd, function(error, stdout, stderr){
			if (error) {
  				out = "" + error;
  				return console.log(out.red);
			} else {
				try {
					process.chdir(target.name);
					return callback();
				} catch (err) {
				  	console.log(err.red);
				}
			};
		});	
	},

	checkout: function (target, callback) {
		exec('git checkout ' + target.branch, function(error, stdout, stderr) {
			if (error) {
				return console.log(error.red);
			} else {
				npm.deploy(function (){
					return callback();
				});
			}
		});	
	}
};

setBranch = function(target) {
	if (target.branch === "" || target.branch === undefined) {
		git.branch = 'master';
	} else {
		git.branch = target.branch;
	}
  	return;
};

gitContinue = function() {
	if (git.branch === "") {
		git.branch = 'master';
	}
  	return;
};