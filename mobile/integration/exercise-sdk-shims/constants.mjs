export default { expoConfig: { extra: { firebaseBackend: 'emulator', firebaseEmulatorHost: '127.0.0.1', apiBaseUrl: process.env.IRONLOG_MOBILE_API_URL ?? 'http://127.0.0.1:3000' } } }
