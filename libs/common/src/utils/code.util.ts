const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function generateCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

// Shared by Tournament.code and Team.code — both generate-then-check-uniqueness before insert so collisions retry cleanly instead of surfacing a raw Mongo duplicate-key error.
export async function generateUniqueCode(
  isTaken: (code: string) => Promise<boolean>,
  length = 6,
): Promise<string> {
  let code = generateCode(length);
  while (await isTaken(code)) {
    code = generateCode(length);
  }
  return code;
}
