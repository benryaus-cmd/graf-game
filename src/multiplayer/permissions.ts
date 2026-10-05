export type ServerRole = 'player' | 'moderator' | 'admin' | 'owner';
export interface ServerPermissions { role: ServerRole; permissions: string[] }

const roles = new Set<ServerRole>(['player', 'moderator', 'admin', 'owner']);

export function readPermissions(value: unknown): ServerPermissions | null {
  if (!value || typeof value !== 'object') return null;
  const message = value as Record<string, unknown>;
  if (message.type !== 'permissions' || typeof message.role !== 'string' || !roles.has(message.role as ServerRole) ||
      !Array.isArray(message.permissions) || !message.permissions.every(permission => typeof permission === 'string')) return null;
  return { role: message.role as ServerRole, permissions: [...new Set(message.permissions as string[])] };
}

export function canDeletePieces(value: ServerPermissions | null): boolean {
  return !!value && (value.permissions.includes('*') || value.permissions.includes('remove_graffiti'));
}

export function canAdminPaint(value: ServerPermissions | null): boolean {
  return !!value && (value.permissions.includes('bypass_graffiti_protection') || value.role === 'admin' || value.role === 'owner');
}

export function canAssignRole(actor: ServerRole | null | undefined, target: ServerRole): boolean {
  return actor === 'owner' || (actor === 'admin' && target !== 'owner');
}

export function canManageRole(actor: ServerRole | null | undefined, currentTarget: ServerRole | undefined, assigned: ServerRole): boolean {
  return canAssignRole(actor, assigned) && !(actor === 'admin' && currentTarget === 'owner');
}
