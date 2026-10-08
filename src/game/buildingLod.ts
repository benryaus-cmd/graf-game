import type { RenderSettings } from './renderSettings';
import type { CityBuildingDescription } from './cityBlockLayout';
export function getBuildingRanges(height: number, s: RenderSettings) {
    if (!s.heightLod)
        return { detail: s.detailDistance, proxy: s.horizonDistance, flat: s.skylineDistance };
    return height < s.lodHeightThreshold ? { detail: s.shortDetailDistance, proxy: s.shortProxyDistance, flat: s.shortFlatDistance } : { detail: s.tallDetailDistance, proxy: s.tallProxyDistance, flat: s.tallFlatDistance };
}
export function distanceToBuilding(x: number, z: number, b: Pick<CityBuildingDescription, 'x' | 'z' | 'width' | 'depth'>): number {
    return Math.hypot(Math.max(0, Math.abs(x - b.x) - b.width / 2), Math.max(0, Math.abs(z - b.z) - b.depth / 2));
}
export function buildingTierVisibility(distance: number, height: number, ready: {
    detail: boolean;
    proxy: boolean;
}, s: RenderSettings, fogEnd = Infinity) {
    const ranges = getBuildingRanges(height, s), detailEnd = Math.min(ranges.detail, fogEnd), proxyEnd = Math.min(Math.max(ranges.detail, ranges.proxy), fogEnd), flatEnd = Math.min(Math.max(ranges.flat, ranges.detail, ranges.proxy), fogEnd);
    const detail = ready.detail && distance <= detailEnd;
    const proxy = !detail && ready.proxy && distance <= proxyEnd;
    const end = ready.detail ? Math.max(detailEnd, ready.proxy ? proxyEnd : 0) : ready.proxy ? proxyEnd : 0;
    return { detail, proxy, flat: s.skyline && distance <= flatEnd && (!(detail || proxy) || distance >= Math.max(0, end - 2)) };
}
