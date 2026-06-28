/** Every translatable UI string. Each locale must provide all of them. */
export interface Messages {
  title: string;
  subtitle: string;
  refreshAria: string;
  updatedAgo: string; // "updated {time}"
  lastUpdate?: string;
  language: string;
  menu?: string;
  menuClose?: string;

  searchPlaceholder: string;
  searchAria: string;
  sort: string;
  sortName: string;
  sortBonus: string;
  filterAll: string;
  filterSurvivor: string;
  filterKiller: string;
  filterBonus: string;
  regionCount: string; // "{shown} of {total} regions"

  roleSurvivor: string;
  roleKiller: string;
  bonusBadge: string;

  noBonus: string;
  noBonusSub: string;
  survivorBonus: string; // "{mult} survivor bonus"
  killerBonus: string; // "{mult} killer bonus"

  badgeStale: string;
  badgeNoData: string;
  badgeNoDataYet: string;

  // visitor's detected region (closest by latency)
  yourRegion: string;
  yourRegionHint: string;
  locating: string;
  locateFailed: string;
  recheckRegion?: string;
  closestNotAvailable?: string; // "Your closest region, {region}, isn't available here"
  regionOverrideAria?: string;
  regionUseAuto?: string;
  regionNotCovered?: string; // "{region} isn't available on this instance"

  ratio: string; // "ratio {value}"
  autoRefreshing: string;

  emptyTitle: string;
  emptyBody: string;
  clearFilters: string;
  errorTitle: string;
  tryAgain: string;

  paginationPrev: string;
  paginationNext: string;

  statusDegraded: string;
  /** Live SSE stream dropped and is retrying; shown data may be stale. */
  liveReconnecting?: string;
  /** Navbar/drawer link to the admin area (shown to admins only). */
  adminNav?: string;
  statusPaused: string;
  statusError: string;

  timeNever: string;
  timeUnknown: string;
  timeJustNow: string;
  timeSecondsAgo: string; // "{n}s ago"
  timeMinutesAgo: string; // "{n}m ago"
  timeHoursAgo: string; // "{n}h ago"
  timeDaysAgo: string; // "{n}d ago"

  bannerDisclaimer: string;
  bannerNice: string;
  bannerContact: string; // "... {email}."
  bannerDismiss: string;
  footerDisclaimer: string;
  footerContact: string; // "Contact: {email}"
  footerThanks: string;

  // Registration strings (data contributors) fall back to English until localized.
  platform?: string;
  registerNav?: string;
  registerBannerTitle?: string;
  registerBannerBody?: string;
  registerBannerCta?: string;
  registerBannerDismiss?: string;
  registerTitle?: string;
  registerIntro?: string;
  registerWhyTitle?: string;
  registerWhyBody?: string;
  registerHowTitle?: string;
  registerHowBody?: string;
  registerNeedTitle?: string;
  registerNeedRegion?: string;
  registerNeedPlatform?: string;
  registerContactCta?: string; // "Email {email}"
  registerNoContact?: string;
  registerBack?: string;
  registerFarNote?: string;
  registerSubmitEnglish?: string;
  registerSetupCta?: string;
  registerCoverageTitle?: string;
  registerCoverageHint?: string;
  coverageRegionCol?: string;
  coverageAgentsCol?: string;
  coverageNone?: string; // badge for 0 agents
  coverageSlugNote?: string;
  steamOnlyTitle?: string;
  steamOnlyBody?: string;
  communityDiscord?: string;
  communityMatrix?: string;

  regionDetails?: string;
  viewHistory?: string;
  historyTitle?: string;
  historyBack?: string;
  historySurvivorLine?: string; // defaults to roleSurvivor
  historyKillerLine?: string; // defaults to roleKiller
  scaleLabel?: string;
  historyZoomHint?: string;
  scaleHourly?: string;
  scaleDaily?: string;
  scaleWeekly?: string;
  scaleMonthly?: string;
  scaleYear?: string;
  historyEmptyTitle?: string;
  historyEmptyBody?: string;
  historyTooFewPoints?: string;
  activityRecentTitle?: string;
  activityChangesTitle?: string;
  activityEmpty?: string;

  forecastTitle?: string;
  forecastBandNote?: string;
  forecastLegendNote?: string;
  forecastPredicted?: string;
  forecastActual?: string;
  forecastSeries?: string;
  forecastConfHigh?: string;
  forecastConfMedium?: string;
  forecastConfLow?: string;
  forecastPeakSurvivor?: string; // "Survivor bonus likely highest around {time} (about {value})."
  forecastPeakKiller?: string; // "Killer bonus likely highest around {time} (about {value})."
  forecastFlat?: string;
  forecastEmpty?: string;

  // Admin / auth screens (en-only placeholders in non-en locales until translated).
  adminTitle: string;
  adminBack: string;
  adminAddAgent: string;
  adminRegion: string;
  adminProvider: string;
  adminProvisionInfo?: string;
  adminProvisionTitle?: string;
  adminProvisionId?: string;
  adminOnlineNow?: string; // "{n} online now"
  adminOnlineHint?: string;
  adminLabelOptional: string;
  adminCreate: string;
  adminAgentsCount: string;
  adminDeleteOrphans: string;
  adminExport: string;
  adminImport: string;
  adminColId: string;
  adminColRegion: string;
  adminColPlatform: string;
  adminColLabel: string;
  adminColSource: string;
  adminColReadings: string;
  adminColEnabled: string;
  adminColActions: string;
  adminChangeRegion: string;
  adminDisableAgent: string;
  adminEnableAgent: string;
  adminEditLabelPlatform: string;
  adminRegenerateToken: string;
  adminClearData: string;
  adminDeleteAgent: string;
  adminMfaTitle: string;
  adminMfaDesc: string;
  adminMfaRolesAria: string;
  adminNoRoleEnforced: string;
  adminUsersCount: string;
  adminCreateUser: string;
  adminColUser: string;
  adminColName: string;
  adminColEmail: string;
  adminColRole: string;
  adminRole: string;
  adminColMfa: string;
  adminRoleForUser: string;
  adminYes: string;
  adminNo: string;
  adminDisableUser: string;
  adminEnableUser: string;
  adminYou: string;
  adminDeleteUser: string;
  adminSignOut: string;
  adminRoleAdmin: string;
  adminRoleUser: string;
  adminRoleAdmins: string;
  adminRoleRegularUsers: string;
  adminFailedToLoad: string;
  adminActionFailed: string;
  adminAgentCreated: string;
  adminCreateFailed: string;
  adminImported: string;
  adminImportedWithSkips?: string;
  adminImportFailed: string;
  adminExportFailed: string;
  adminAgentEnabled: string;
  adminAgentDisabled: string;
  adminMfaUpdated: string;
  adminRoleUpdated: string;
  adminUserEnabled: string;
  adminUserDisabled: string;
  adminTokenTitle: string;
  adminTokenOnce: string;
  adminCopied: string;
  adminCopy: string;
  adminDone: string;
  adminCancel: string;
  adminRetokenTitle: string;
  adminRetokenBody: string;
  adminRetokenConfirm: string;
  adminTokenRegenerated: string;
  adminRegionChanged: string;
  adminAgentUpdated: string;
  adminAgentDeleted: string;
  adminDeleteUserTitle: string;
  adminDeleteUserBody: string;
  adminDelete: string;
  adminUserDeleted: string;
  adminResetMfa?: string;
  adminResetMfaTitle?: string;
  adminResetMfaBody?: string;
  adminMfaReset?: string;
  adminOrphansTitle: string;
  adminOrphansBody: string;
  adminOrphansConfirm: string;
  adminOrphansDeleted: string;
  adminDeletedReadings: string;
  adminCreatedUser: string;
  adminExistingReadings: string;
  adminMoveAgent: string;
  adminNewRegionCurrent: string;
  adminNewRegionAria: string;
  adminModeKeepTitle: string;
  adminModeKeepDesc: string;
  adminModeOrphanTitle: string;
  adminModeOrphanDescRegion: string;
  adminModeDeleteTitle: string;
  adminModeDeleteDescRegion: string;
  adminMove: string;
  adminDeleteAgentTitle: string;
  adminDeleteAgentBody: string;
  adminModeOrphanDescDelete: string;
  adminModeDeleteDescDelete: string;
  adminEditAgent: string;
  adminLabel: string;
  adminPlatform: string;
  adminSave: string;
  adminClearDataTitle: string;
  adminClearDataHint: string;
  adminRatioMin: string;
  adminRatioMax: string;
  adminSurvivorMin: string;
  adminKillerMin: string;
  adminFrom: string;
  adminUntil: string;
  adminDeleting: string;
  adminDeleteMatching: string;
  adminFailed: string;
  adminUsername: string;
  adminPassword: string;
  adminEmail?: string;
  adminName?: string;
  adminOptional?: string;
  adminCreating: string;
  loginError: string;
  loginPolicyTitle: string;
  loginPolicySubtitle: string;
  loginRoleAdmins: string;
  loginRoleRegularUsers: string;
  loginContinue: string;
  loginMfa: string;
  loginConfirmItsYou: string;
  loginAuthenticatorCode: string;
  loginVerify: string;
  loginUsePasskey: string;
  loginRememberDevice?: string;
  loginSetupMfa: string;
  loginRoleRequiresSecond: string;
  loginQrAlt: string;
  loginEnterCodeConfirm: string;
  loginActivate: string;
  loginBack: string;
  loginSetupAuthenticator: string;
  loginRegisterPasskey: string;
  loginSignIn: string;
  loginSubtitle: string;
  loginUsername: string;
  loginPassword: string;
  loginSigningIn: string;
  setupError: string;
  setupTitle: string;
  setupSubtitle: string;
  setupUsername: string;
  setupName: string;
  setupEmail: string;
  setupPassword: string;
  setupRequireMfa: string;
  setupCreating: string;
  setupCreateAdmin: string;

  // App shell / navigation
  navSecurity: string;
  navAccount?: string;
  notFoundTitle?: string;
  notFoundBody?: string;
  appLoading: string;
  appNoAdminAccess: string;
  appBackOverview: string;

  // Account / security page
  accountTitle: string;
  accountBack: string;
  accountPasswordSection: string;
  accountCurrentPassword: string;
  accountNewPassword: string;
  accountChangePassword: string;
  accountTotpSection: string;
  accountTotpEnabled: string;
  accountTotpNone: string;
  accountTotpQrAlt: string;
  accountTotpEnterCode: string;
  accountTotpCodePlaceholder: string;
  accountConfirm: string;
  accountCancel: string;
  accountTotpReplace: string;
  accountTotpSetUp: string;
  accountTotpRemove: string;
  accountTotpModalTitle?: string;
  accountPasskeysSection: string;
  accountAddPasskey: string;
  accountPasskeyNameTitle?: string;
  accountPasskeyNameLabel?: string;
  accountPasskeyNamePlaceholder?: string;
  accountPasskeyCreate?: string;
  accountNoPasskeys: string;
  accountPasskeyLabel: string; // "Passkey #{id}"
  accountLastUsed: string; // "last used {date}"
  accountRemove: string;
  accountDevicesSection?: string;
  accountDevicesHint?: string;
  accountForgetDevices?: string;
  accountDevicesForgottenToast?: string;
  accountApiKeysSection?: string;
  accountApiKeysHint?: string;
  accountCreateApiKey?: string;
  accountApiKeyLabelField?: string;
  accountApiKeyExpiryField?: string;
  accountNoApiKeys?: string;
  accountApiKeyShownOnce?: string;
  accountApiKeyCopy?: string;
  accountApiKeyCopied?: string;
  accountApiKeyCreatedToast?: string;
  accountApiKeyRevokedToast?: string;
  accountApiKeyNeverExpires?: string;
  accountApiKeyExpires?: string; // "expires {date}"
  accountApiKeyEnable?: string;
  accountApiKeyDisable?: string;
  accountApiKeyEnabledToast?: string;
  accountApiKeyDisabledToast?: string;
  accountPasswordChanged: string;
  accountTotpSetUpToast: string;
  accountTotpRemovedToast: string;
  accountPasskeyAdded: string;
  accountPasskeyRemoved: string;
  accountFailedLoadPasskeys: string;
  accountSomethingWrong: string;
  accountCouldNotStartEnrollment: string;
  accountCouldNotAddPasskey: string;
  accountCouldNotRemovePasskey: string;
}

/** Dead by Daylight's supported interface languages. */
export const LANGS = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'es-LA', name: 'Español (LA)' },
  { code: 'it', name: 'Italiano' },
  { code: 'pl', name: 'Polski' },
  { code: 'pt-BR', name: 'Português (BR)' },
  { code: 'ru', name: 'Русский' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'zh-Hans', name: '简体中文' },
  { code: 'zh-Hant', name: '繁體中文' },
  { code: 'th', name: 'ไทย' },
  { code: 'tr', name: 'Türkçe' },
] as const;

export type Lang = (typeof LANGS)[number]['code'];
