export function identityMatches(identity, env = process.env) {
  return Boolean(
    env.WOODRIGHT_DATA_ENVIRONMENT &&
    env.WOODRIGHT_EXPECTED_DATABASE_IDENTITY &&
    env.WOODRIGHT_EXPECTED_BACKEND_REVISION &&
    identity?.role === env.WOODRIGHT_DATA_ENVIRONMENT &&
    identity.databaseAlias === env.WOODRIGHT_EXPECTED_DATABASE_IDENTITY &&
    identity.backendRevision === env.WOODRIGHT_EXPECTED_BACKEND_REVISION,
  );
}
