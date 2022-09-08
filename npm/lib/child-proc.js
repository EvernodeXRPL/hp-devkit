const { execSync } = require('child_process');

function exec(commad, showOutput = false, throwError = false) {
	try {
		return execSync(commad, showOutput ? { stdio: 'inherit' } : {});
	}
	catch (e) {
		if (throwError)
			throw e;
	}
}

module.exports = {
	exec
}