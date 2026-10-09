/**
 * The plain-text invitation a host copies and pastes. Contains the
 * PARTICIPANT link only — the host start link is never available to it.
 */
export function invitationText(input: {
  title: string;
  when?: string | null;
  joinUrl: string;
  zoomId?: string | null;
  passcode?: string | null;
  agenda?: string | null;
}): string {
  const id = input.zoomId ? input.zoomId.replace(/(\d{3})(\d{3,4})(\d{4})/, "$1 $2 $3") : null;
  return [
    `You're invited to a Zoom conference: ${input.title}`,
    input.when ? `When: ${input.when}` : null,
    "",
    `Join Zoom: ${input.joinUrl}`,
    id ? `Meeting ID: ${id}` : null,
    input.passcode ? `Passcode: ${input.passcode}` : null,
    input.agenda ? `\nAgenda:\n${input.agenda}` : null,
  ].filter((line) => line !== null).join("\n");
}
