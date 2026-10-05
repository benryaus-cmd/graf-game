export function aippyDisplayName(user: { nickName?: string; username?: string }): string {
  return user.nickName?.trim() || (user.username?.trim() ? '@' + user.username.trim() : 'PLAYER');
}
