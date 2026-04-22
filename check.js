const fs = require('fs');
const content = fs.readFileSync('docs/sdk_test.html', 'utf8');

// 1. Verify script tag with data-sdk-url
const expectedUrl = '../sdk/med-hermes-sdk.js?v=debug-handshake';
const hasUrl = content.includes(`data-sdk-url="${expectedUrl}"`);

if (!hasUrl) {
    console.error('Error: Required script tag with data-sdk-url NOT found.');
    process.exit(1);
} else {
    console.log('Success: Found expected data-sdk-url.');
}

// 2. Extract last inline script and validate syntax
const scriptMatches = content.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi);
if (scriptMatches) {
    const lastScriptTag = scriptMatches[scriptMatches.length - 1];
    const scriptContentMatch = lastScriptTag.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
    if (scriptContentMatch && scriptContentMatch[1].trim()) {
        const code = scriptContentMatch[1];
        try {
            new Function(code);
            console.log('Success: Last inline script syntax is valid.');
        } catch (e) {
            console.error('Error: Syntax error in last inline script:', e.message);
            process.exit(1);
        }
    } else {
        console.log('Warning: Last script tag is empty or not inline code.');
    }
} else {
    console.error('Error: No script tags found.');
    process.exit(1);
}
