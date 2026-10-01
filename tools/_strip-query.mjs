export async function resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.replace(/\?.*$/, ""), context);
}
