/** Dev/QA switches via query string:
 *  ?tier=low|mid|high  ?nofx=1  ?noreflect=1  ?motion=full|reduced */
const params = new URLSearchParams(window.location.search);

const tierParam = params.get('tier');
const motionParam = params.get('motion');

export const DEBUG_FLAGS = {
  tierOverride:
    tierParam === 'low' || tierParam === 'mid' || tierParam === 'high'
      ? (tierParam as 'low' | 'mid' | 'high')
      : null,
  noPostFx: params.get('nofx') === '1',
  noReflect: params.get('noreflect') === '1',
  // ?xray=full forces the reveal open across the whole model — used once to
  // find malformed anatomy sub-meshes (AI models mangle hands) so they can be
  // hidden by name. ?xray=off disables the lens entirely.
  xray: params.get('xray'),
  // ?env=off removes the portal + custom water floor and reverts to the plain
  // reflector — an escape hatch to isolate the cinematic environment if the
  // scene ever renders black.
  env: params.get('env'),
  // ?debug=1 reveals the Leva cinematic-tuning panel. Hidden for real
  // visitors — every render value is live-adjustable here during tuning.
  debug: params.get('debug') === '1',
  motionOverride:
    motionParam === 'full' || motionParam === 'reduced' ? motionParam : null,
};
