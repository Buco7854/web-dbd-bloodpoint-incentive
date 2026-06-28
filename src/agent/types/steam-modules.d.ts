// steam-user and steam-totp ship no types and are optional deps loaded via
// dynamic import, so declare them untyped to keep the build independent of them.
declare module 'steam-user';
declare module 'steam-totp';
