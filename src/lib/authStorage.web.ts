import AsyncStorage from '@react-native-async-storage/async-storage';

// On web there is no hardware keychain, so we keep the default browser storage
// (AsyncStorage maps to localStorage). The practical mitigation on web is the
// absence of any XSS sink — confirmed in the security review — since an XSS
// would be the only way to read this token. The native build encrypts at rest
// (see authStorage.native.ts); the web crypto libraries never enter this bundle
// because Metro resolves this .web file instead.
export const authStorage = AsyncStorage;
