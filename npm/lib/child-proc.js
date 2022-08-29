const { execSync } = require('child_process');

function exec(commad, showOutput = false) {
	return execSync(commad, showOutput ? { stdio: 'inherit' } : {});
}

module.exports = {
	exec
}