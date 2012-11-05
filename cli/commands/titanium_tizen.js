/*
 * stand alone builder fo Titanium Tizen
 * requires pre installer TIZEN SDK (2.0.0 for now)
 * call 
 * mode titanium.js <path to project>
 *
 */

console.log("command line args: " + process.argv);
//TODO: add Linux support, currently script supports Windows only
//TODO: pass it as parameters, hardcoded are ok for sample only

var fs = require('fs');
var path = require('path');

//default value, good only for default installation of Tizen SDK 2.0.0 on Windows, 
var sdkpath = 'C:\\\\tizen-sdk\\';

//detecting current working dir
var targetProject = process.cwd();

if(!fs.existsSync(path.join(targetProject, 'tiapp.xml'))){
	console.log('cannot file file  ' + targetProject + '\\tiapp.xml' + 'in current directory. Will it is not Titanium project');
	process.exit(1);//error code for exit
}

var myArgs = process.argv.slice(2);

var async = require('async');

	async.series([
		function(next){//packaging
			//Detect Tizen SDK
			//TODO: check OS, supporting windows only(for now useing registry to find path)
			// read key HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders
			// key "Local AppData" has path e.g. "C:\Users\aod\AppData\Local\tizen-sdk-data\tizensdkpathirst line from it 
			//"C:\Users\aod\AppData\Local\tizen-sdk-data\tizensdkpath
			var keyvalue = null;
			var reg = require('child_process');
			reg.exec(
				'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders" -v "Local AppData"', 
				function (err, stdout, stderr) {

					if(stdout !== null && (typeof stdout != 'undefined')){
						console.log('obj type' + typeof stdout);
						var arr = stdout.split(" ");
						keyvalue = arr[arr.length-1];//last parameter is path
						keyvalue = keyvalue.slice(0, -4);
						keyvalue = keyvalue + '\\tizen-sdk-data\\tizensdkpath';
						console.log('reading file: ' + keyvalue);
						//fs = require('fs');
						fs.readFile(keyvalue, 'utf8', function (err,data) {
							if (err) {
								return console.log(err);
							}
							var arr = data.split("=");
							sdkpath =  arr[1];
							console.log("Tizen SDK found at: " + sdkpath);
							//next tick
							next(null, 'ok');
						});

					}else{
						console.log('error: cannot read values from windows registry');
					}
				});			

		}
		, function(next){
			//TODO: use commander for parsing parameters
			if(myArgs.length > 0){
				switch (myArgs[0]) {
				case 'build':
					console.log('starting build process');
					startTitaniumMobileBuild();
					break;
				case 'install':
					installWgt(path.join( targetProject, 'build', 'tizen', 'tizenapp.wgt'));
					break;
				case 'runemulator':
					console.log('run on tizen emulator: ' + path.join( targetProject, 'build', 'tizen', 'tizenapp.wgt').toString());
					runWgtOnEmulator(myArgs[1], path.join( targetProject, 'build', 'tizen', 'tizenapp.wgt'));
					break;
				case 'runsimulator':
					console.log('run on tizen simulator');
					break;
				default:
					console.log('Sorry, that is not something I know how to do.');
				}
			}
		}
		], function(err){
			if(err) 
				console.log(err)
			else {
				// Waits for defined functions to finish
				console.log('Failed')
			}
	});

function startTitaniumMobileBuild(){
	// initiate bild process with --platform=mobileweb
	console.log('Initiate build process for mobileweb application');
	var builder = require("child_process");
	builder.exec(
		'titanium build --platform=mobileweb --project-dir="'+ targetProject + '" --log-level=debug',
		function (err, stdout, stderr) {
			console.log(stdout);
			if(err != null){
				console.log('failed build for mobileweb platform for ' + targetProject);
				console.log(stderr);
			}else{
				//next tick
				createTizenProject();
			}
	});
}
 
function createTizenProject(){		
	var tizenBuildDir = path.join(targetProject, 'build', 'tizen');
	var fs = require('fs');
	var wrench = require('wrench');

	console.log('Creating tizen app in ' + tizenBuildDir);

	if(fs.existsSync(tizenBuildDir)){
		wrench.rmdirSyncRecursive(tizenBuildDir, true);
	}
	
	//copy mobileweb into tizen
	fs.renameSync(path.join(targetProject, 'build', 'mobileweb'), tizenBuildDir);

	//TODO: generate config.xml from content of tiapp.xml
	//copyFileSync(path.normalize(path.join(__dirname, '..','..','templates','app','config.xml')), path.join(tizenBuildDir,'config.xml'));	
	addTizenToTiXml();
	generateConfigXml();
	copyFileSync( path.normalize(path.join(__dirname, '..','..','templates','app', 'default', 'Resources', 'tizen', 'appicon.png')), path.join(tizenBuildDir,'icon.png'));
	wgtPackaging7z();
}

function copyFileSync(srcFile, destFile) {
	var bytesRead, fdr, fdw, pos;
	var BUF_LENGTH = 64 * 1024;
	var _buff = new Buffer(BUF_LENGTH);
	fdr = fs.openSync(srcFile, 'r');
	fdw = fs.openSync(destFile, 'w');
	bytesRead = 1;
	pos = 0;
	while (bytesRead > 0) {
		bytesRead = fs.readSync(fdr, _buff, 0, BUF_LENGTH, pos);
		fs.writeSync(fdw, _buff, 0, bytesRead);
		pos += bytesRead;
	}
	fs.closeSync(fdr);
	return fs.closeSync(fdw);
};

function wgtPackaging7z(){
	console.log('Packaging application into wgt');
	var tizenBuildDir = path.join(targetProject, 'build','tizen');

	var packer = require('child_process');
	var cmd = '7z a ' + tizenBuildDir + '\\tizenapp.zip' + ' ' + tizenBuildDir+'\\*';

	var async = require('async');

	var cmd7za = find7za().toString() + ' a "' + path.join(tizenBuildDir, 'tizenapp.wgt') + '" "' + tizenBuildDir + '/*" -tzip';
	//packaging
	//TODO: xml signing will required late
	console.log('7z cmd: ' + cmd7za);
	packer.exec(
		cmd7za,
		function (err, stdout, stderr) {
			console.log(stdout);
			if(err != null){
				console.log('failed packaging for tizen platform');
				console.log(stderr);
				next(err, 'failed');
			}else{
				console.log('compressing ok');
			}
		});		
}

function installWgt(pathToWgt){
	var runner = require("child_process");
	var pathToCmd = path.join(sdkpath, 'tools', 'ide', 'bin', 'web-install.bat');
	var cmd = pathToCmd + ' --id=http://yourdomain/Harness --widget=' + pathToWgt;
	console.log('install cmd: ' + cmd);
	runner.exec(
		cmd,
		function (err, stdout, stderr) {
			console.log(stdout);
			if(err != null){
				console.log('failed install wgt');
				console.log(stderr);
			}else{
				console.log('Installed wgt: ' + pathToWgt);
			}
	});	
}

function runWgtOnEmulator(widgetId, pathToWgt){
	var runner = require("child_process");
	var pathToWebRun = path.join(sdkpath, 'tools', 'ide', 'bin', 'web-run.bat');
	
	var cmd = pathToWebRun + ' web-run.bat -id ' + widgetId + ' -w "' + pathToWgt +'"';
	console.log('Run widget cmd: ' + cmd);
	runner.exec(
		cmd,
		function (err, stdout, stderr) {
			console.log(stdout);
			if(err != null){
				console.log('failed run wgt');
				console.log(stderr);
			}else{
				console.log('Run ok ');
			}
	});	
}

function fixStatus200ErrorInIndexHtml(){
	console.log('Fixing issue with expected HTTP status 200 when working without http server');
	var filepath = path.join(targetProject, 'build', 'tizen', 'index.html');
	console.log('FIX: target path: ' + filepath);
	var indexFile =  fs.readFileSync(filepath, 'utf8').toString();
	console.log('FIX: read size: ' + indexFile.length);
	indexFile = indexFile.replace('if (xhr.status === 200) {', 'if (xhr.status === 200 || xhr.status === 0) {');
	fs.writeFileSync(filepath, indexFile, 'utf8');
}

function find7za(){	
	var zippath = path.normalize(path.join(path.dirname(require.resolve('node-appc')), '..','tools','7zip','7za.exe'));	
	console.log('7za.exe detected. Path is ' + path.normalize(zippath));

	if(fs.existsSync(zippath)){
		return zippath;
	}else{
		console.log('Not found 7za.exe path is wrong ' + path.normalize(zippath));
	}
}

function addTizenToTiXml(){
	var xmldom = require('xmldom');
	var DOMParser = xmldom.DOMParser;
	var XMLSerializer = xmldom.XMLSerializer;

	var xmlpath = path.join(targetProject, 'tiapp.xml');
	var doc = new DOMParser().parseFromString(fs.readFileSync(xmlpath).toString(), 'text/xml');
	var parsedTiXml = doc.documentElement;
	//check for Tizen section
	var tizenTagFound = false;
	var node = parsedTiXml.firstChild;

	while (node) {
		if (node.nodeType == 1 && node.tagName == 'tizen'){
			//tizen section exists, nothing to do
			tizenTagFound = true;
		}
		node = node.nextSibling;
	}

	if(tizenTagFound){
		return;
	}
	console.log('<tizen> node absent in tiapp.xml, adding it.');
	//todo: fix deployment-targets
	
	//no tizen section in xml, add it
	var tizenSectionStr = '<tizen appid="change1me2"><feature name="http://tizen.org/api/alarm" required="true"/><feature name="http://tizen.org/api/alarm.read" required="true"/><feature name="http://tizen.org/api/alarm.write" required="true"/><feature name="http://tizen.org/api/application" required="true"/><feature name="http://tizen.org/api/application.kill" required="true"/><feature name="http://tizen.org/api/application.launch" required="true"/><feature name="http://tizen.org/api/application.read" required="true"/><feature name="http://tizen.org/api/bluetooth" required="true"/><feature name="http://tizen.org/api/bluetooth.admin" required="true"/><feature name="http://tizen.org/api/bluetooth.gap" required="true"/><feature name="http://tizen.org/api/bluetooth.spp" required="true"/><feature name="http://tizen.org/api/calendar" required="true"/><feature name="http://tizen.org/api/calendar.read" required="true"/><feature name="http://tizen.org/api/calendar.write" required="true"/><feature name="http://tizen.org/api/call" required="true"/><feature name="http://tizen.org/api/call.history" required="true"/><feature name="http://tizen.org/api/call.history.read" required="true"/><feature name="http://tizen.org/api/call.history.write" required="true"/><feature name="http://tizen.org/api/call.state" required="true"/><feature name="http://tizen.org/api/contact" required="true"/><feature name="http://tizen.org/api/contact.read" required="true"/><feature name="http://tizen.org/api/contact.write" required="true"/><feature name="http://tizen.org/api/download" required="true"/><feature name="http://tizen.org/api/filesystem" required="true"/><feature name="http://tizen.org/api/filesystem.read" required="true"/><feature name="http://tizen.org/api/filesystem.write" required="true"/><feature name="http://tizen.org/api/geocoder" required="true"/><feature name="http://tizen.org/api/lbs" required="true"/><feature name="http://tizen.org/api/mediacontent" required="true"/><feature name="http://tizen.org/api/mediacontent.read" required="true"/><feature name="http://tizen.org/api/mediacontent.write" required="true"/><feature name="http://tizen.org/api/messaging" required="true"/><feature name="http://tizen.org/api/messaging.read" required="true"/><feature name="http://tizen.org/api/messaging.send" required="true"/><feature name="http://tizen.org/api/messaging.write" required="true"/><feature name="http://tizen.org/api/nfc" required="true"/><feature name="http://tizen.org/api/nfc.admin" required="true"/><feature name="http://tizen.org/api/nfc.p2p" required="true"/><feature name="http://tizen.org/api/nfc.tag" required="true"/><feature name="http://tizen.org/api/notification" required="true"/><feature name="http://tizen.org/api/power" required="true"/><feature name="http://tizen.org/api/systeminfo" required="true"/><feature name="http://tizen.org/api/time" required="true"/><feature name="http://tizen.org/api/time.read" required="true"/><feature name="http://tizen.org/api/time.write" required="true"/><feature name="http://tizen.org/api/tizen" required="true"/><access origin="*"/></tizen>';
	var tizenSec = new DOMParser().parseFromString(tizenSectionStr, 'text/xml');
	parsedTiXml.appendChild(tizenSec);
	var result = new XMLSerializer().serializeToString(doc);
	fs.writeFileSync(xmlpath, result, 'utf8');
}

function generateConfigXml(){
	console.log('generating config.xml for tizen application');
	var temltPath = path.normalize(path.join(__dirname, '..','..','templates','app','config.tmpl'));
	var resulConfig = path.join(targetProject, 'build', 'tizen','config.xml');

	//read values from tiapp.xml
	var xmldom = require('xmldom');
	var DOMParser = xmldom.DOMParser;
	var XMLSerializer = xmldom.XMLSerializer;

	var xmlpath = path.join(targetProject, 'tiapp.xml');
	var doc = new DOMParser().parseFromString(fs.readFileSync(xmlpath).toString(), 'text/xml');
	var parsedTiXml = doc.documentElement;
	//check for Tizen section

	var node = parsedTiXml.firstChild;

	//values for config
	var widgetName = 'Titanium App';
	var widgetId = 'Titanium App';
	var tiId = 'com.ti.changeme';
	var tizenNode;
	var tizenAppId = 'zhrTuDSwYV';
	while (node) {
		if (node.nodeType == 1 && node.tagName == 'tizen'){
			//tizen section found, keep reference
			tizenNode = node;
			if(tizenNode.getAttribute('appid')){
				tizenAppId = tizenNode.getAttribute('appid');;
			}
		}
		if (node.nodeType == 1 && node.tagName == 'name'){
			widgetName = node.textContent;
		}
		if (node.nodeType == 1 && node.tagName == 'id'){
			tiId = node.textContent;
		}
		node = node.nextSibling;
	}
	widgetId = 'http://' + tiId + '/' + widgetName;

	var templt = fs.readFileSync(temltPath, 'utf8').toString(widgetId);
	templt = templt.replace('%%WIDGET_ID%%', widgetId);
	templt = templt.replace('%%WIDGET_NAME%%', widgetName);
	templt = templt.replace('%%APP_ID%%', tizenAppId);
	templt = templt.replace('%%FEATURES_LIST%%', new XMLSerializer().serializeToString(tizenNode));
	templt = templt.replace(new RegExp('<tizen appid=".+">'), ' ');
	templt = templt.replace('</tizen>', ' ');
	fs.writeFileSync(resulConfig, templt, 'utf8');
}