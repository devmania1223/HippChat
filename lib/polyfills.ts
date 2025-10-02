// Import core polyfills
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

// Buffer polyfill
import { Buffer } from 'buffer';
if (typeof global.Buffer === 'undefined') {
    global.Buffer = Buffer;
}

// Process polyfill
import process from 'process';
if (typeof global.process === 'undefined') {
    global.process = process;
}

// Crypto polyfill (important for bip39 / @noble/hashes)
import { getRandomValues as expoGetRandomValues } from 'expo-crypto';
if (typeof global.crypto === 'undefined') {
    global.crypto = { getRandomValues: expoGetRandomValues } as Crypto;
}
