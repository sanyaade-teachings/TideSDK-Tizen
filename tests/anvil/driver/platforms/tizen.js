/*
 * Appcelerator Titanium Mobile
 * Copyright (c) 2011-2012 by Appcelerator, Inc. All Rights Reserved.
 * Licensed under the terms of the Apache Public License
 * Please see the LICENSE included with this distribution for details.
 *
 * Purpose: contains specific logic for running driver commands on Tizen
 *
 * Description: contains Tizen specific wrapper functions around common driver commands
 */

var path = require("path"),
	net = require("net"),
	http = require('http'),
	fs = require('fs'),
	os = require("os"),
	common = require(path.resolve(driverGlobal.driverDir, "common")),
	driverUtils = require(path.resolve(driverGlobal.driverDir, "driverUtils"));

module.exports = new function() {
	var self = this;
	var commandFinishedCallback;
	var testPassFinishedCallback;
	var server;
	var serverRunning = false;
	var serverListening = true;
	var browserOnlyMode = false;
	var connection;
	var stoppingHarness = false;

	this.name = "tizen";

	this.init = function(commandCallback, testPassCallback) {
		// check mobile web specific config items
		driverUtils.checkConfigItem("httpPort", driverGlobal.config.httpPort, "number");

		commandFinishedCallback = commandCallback;
		testPassFinishedCallback = testPassCallback;
	};

	this.processCommand = function(command) {
		var commandElements = command.split(" ");

		if (commandElements[0] === "start") {
			var browserOnlyArg = driverUtils.getArgument(commandElements, "--browser-only");
			if (browserOnlyArg === "true") {
				browserOnlyMode = browserOnlyArg;
			}

			common.startTestPass(commandElements, self.startConfig, commandFinishedCallback);

		} else if (commandElements[0] === "exit") {
			process.exit(1);

		} else {
			driverUtils.log("invalid command\n\n"
				+ "Commands:\n"
				+ "    start - starts test run which includes starting over with clean harness project\n"
				+ "        Arguments (optional):\n"
				+ "            --config-set=<config set ID> - runs the specified config set\n"
				+ "            --config=<config ID> - runs the specified configuration only\n"
				+ "            --suite=<suite name> - runs the specified suite only\n"
				+ "            --test=<test name> - runs the specified test only (--suite must be specified)\n"
				+ "            --browser-only=<boolean> - if set to true, the harness is not deployed to a device\n"
				+ "                and instead the user is expected to manually load the \"127.0.0.1/index.html\"\n"
				+ "                url in order to run tests.  Reloading the page manually will be required when\n"
				+ "                the harness is restarted due to a config finishing or an error occurring\n\n"
				+ "    exit - exit driver\n",
				0, true);

			commandFinishedCallback();
		}
	};

	var createHarness = function(successCallback, errorCallback) {
		var argString = "harness com.appcelerator.harness " + path.resolve(driverGlobal.harnessDir, "tizen tizen") + " " + driverGlobal.config.currentTiSdkDir;

		// due to python behavior on windows, we need to escape the slashes in the argument string
		if (os.platform().substr(0 ,3) === "win") {
			argString = argString.replace(/\\/g, "\\\\");
		}

		common.createHarness(
			"tizen",
			"\"" + path.resolve(driverGlobal.config.currentTiSdkDir, "project.py") + "\" " + argString,
			successCallback,
			errorCallback
			);
	};

	var deleteHarness = function(callback) {
		process.chdir(driverGlobal.driverDir);
		common.deleteHarness("tizen", callback);
	};

	var buildHarness = function(successCallback, errorCallback) {
		var buildCallback = function() {
			var  command_str = "titanium build --platform=tizen --project-dir " + path.resolve(driverGlobal.harnessDir, "tizen", "harness");
			driverUtils.runCommand(command_str, driverUtils.logStdout, function(error) {
				if (error !== null) {
					driverUtils.log("error encountered when building harness: " + error);
					errorCallback();
				} else {
					driverUtils.log("harness built");
					successCallback();
				}
			});
		};

		if (path.existsSync(path.resolve(driverGlobal.harnessDir, "tizen", "harness", "tiapp.xml"))) {
			buildCallback();
			
		} else {
			driverUtils.log("harness does not exist, creating");
			createHarness(buildCallback, errorCallback);
		}
	};
	
	this.startConfig = function() {
		
		var deleteCallback = function() {
			deleteHarness(uninstallCallback);
		};
		
		var uninstallCallback = function() {
			uninstallHarness(buildCallback, commandFinishedCallback);
		};
		
		var buildCallback = function() {
			buildHarness(serverCallback, commandFinishedCallback);
		};
		
		var serverCallback = function() {
			startServer(runCallback, commandFinishedCallback);
		};
		
		var runCallback = function() {
			runHarness(null, commandFinishedCallback);
		};
				
		// this is the same whether browser only mode is enabled or not
		common.customTiappXmlProperties["driver.httpPort"] = {value: driverGlobal.config.httpPort, type: "int"};

		function getIpAddress() {
			var networkInterfaces = require("os").networkInterfaces();
			for (i in networkInterfaces) {
				for (j in networkInterfaces[i]) {
					var address = networkInterfaces[i][j];
					if (address.family === 'IPv4' && !(address.internal)) {
						return address.address;
					}
				}
			}
		}
				
		// get the address for the driver that should be accessible to the harness via wifi
		var ipAddress = getIpAddress();
		if (ipAddress) {
			driverGlobal.httpHost = "http://" + ipAddress;
			/*
			make sure that the harness has the correct wifi address to use when making requests to 
			the driver
			*/
			common.customTiappXmlProperties["driver.httpHost"] = {value: driverGlobal.httpHost, type: "string"};

		} else {
			driverUtils.log("unable to get IP address", driverGlobal.logLevels.quiet);
			commandFinishedCallback();
		}
				
		//FIRE 
		self.deviceIsConnected(function(connected) {
			if (connected) {
				common.startConfig(deleteCallback);
			} else {
				driverUtils.log("no attached device found, unable to start config", driverGlobal.logLevels.quiet);
				commandFinishedCallback();
			}
		});
		
	};
	
	var startServer = function(successCallback, errorCallback) {
		server = http.createServer(function (request, response) {
			var prefix = path.resolve(driverGlobal.harnessDir, "tizen", "harness", "build", "tizen");
			var filePath = prefix + request.url.split("?")[0];
			if (filePath === prefix + '/') {
				filePath = prefix + '/index.html';
			}

			var extname = path.extname(filePath);
			var contentType = 'text/html';
			switch (extname) {
				case '.js':
					contentType = 'text/javascript';
					break;

				case '.css':
					contentType = 'text/css';
					break;
			}

			if (extname !== ".anvil") {
				path.exists(filePath, function(exists) {
					if (exists) {
						fs.readFile(filePath, function(error, content) {
							if (error) {
								response.writeHead(500);
								response.end();

							} else {
								response.writeHead(200, {
									"Content-Type": contentType,
									"Cache-Control": "max-age=0, must-revalidate"
								});
								response.end(content, 'utf-8');
							}
						});

					} else {
						response.writeHead(404);
						response.end();
					}
				});

			} else {
		        var postData = '';

    		    request.on('data', function (data) {
    		        postData += data;
				});
    		    request.on('end', function () {
					var responseData = common.processHarnessMessage(postData);

					response.writeHead(200, {
						"Content-Type": contentType,
						"Cache-Control": "max-age=0, must-revalidate"
					});
					response.end(responseData, 'utf-8');
        		});
			}
		});

		server.on('error', function (e) {
			if ((e.code === 'EADDRINUSE') && (serverRunning === false)) {
				driverUtils.log('Address in use, retrying...');
				setTimeout(function() {
					if (serverListening === true) {
						server.close();
					}
					serverListening = true;
					server.listen(driverGlobal.config.httpPort);
				}, 2000);

			} else {
				errorCallback();
			}
		});

		server.on('listening', function (e) {
			serverRunning = true;
			driverUtils.log("Server running at " + driverGlobal.httpHost + ":" + driverGlobal.config.httpPort);

			if (successCallback !== null) {
				successCallback();
			}
		});

		serverListening = true;
		server.listen(driverGlobal.config.httpPort);
	};
	
	var runHarness = function(successCallback, errorCallback) {
		process.chdir( path.resolve(driverGlobal.harnessDir, "tizen/harness/build/tizen") );
		driverUtils.runCommand("web-run -w tizenapp.wgt -i http://www.test.com",
		driverUtils.logStdout, function(error) {
			if (error !== null) {
				driverUtils.log("error encountered when running harness: " + error);
				if (errorCallback) {
					errorCallback();
				}
			}else{
				driverUtils.log('installed, running...');
				if (successCallback)
					successCallback();
			}
			
		});
	};
	
	var uninstallHarness = function(successCallback, errorCallback) {
		driverUtils.runCommand("web-uninstall -i http://www.test.com", driverUtils.logStdout, function(error) {
			if (error !== null) {
				driverUtils.log("error encountered when uninstalling harness: " + error);
				if (errorCallback) {
					errorCallback();
				}

			} else {
				driverUtils.log("harness uninstalled");
				if (successCallback) {
					successCallback();
				}
			}
		});
	};

	// handles restarting the test pass (usually when an error is encountered)
	this.resumeConfig = function() {
		
		if (browserOnlyMode === "true") {
			// in browser only mode, no action is required
			return;
		}

		var runCallback = function() {
			runHarness(commandFinishedCallback);
		};

		stopHarness();
		startServer(runCallback, commandFinishedCallback);
	};

	// called when a config is finished running
	this.finishConfig = function() {
		stopHarness();
		common.finishConfig(testPassFinishedCallback);
	};

	var stopHarness = function() {
		if (serverRunning) {
			serverRunning = false;
			serverListening = false;
			server.close();
		}
	};
	
	this.deviceIsConnected = function(callback) {
		driverUtils.runCommand("sdb devices", driverGlobal.logLevels.quiet, function(error, stdout, stderr) {
			var searchString = "List of devices attached";
			var deviceListString = "";
			var startPos = stdout.indexOf(searchString);
			if (startPos > -1) {
				var deviceListString = stdout.substring(startPos + searchString.length, stdout.length);
				deviceListString = deviceListString.replace(/\s/g,"");
			}

			if (deviceListString.length < 1) {
				callback(false);

			} else {
				callback(true);
			}
		});
	};
};
