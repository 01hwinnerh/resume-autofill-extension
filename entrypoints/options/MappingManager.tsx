import { useEffect, useMemo, useState } from 'react';
import { createMappingId, type MappingScope, type NormalizedUserFieldMapping } from '../../src/shared/mapping';
import type { Profile } from '../../src/shared/profile';
import type { MappingStore } from '../../src/storage/mapping-store';
import { filterMappings, mappingProfileLabel, mappingProfileOptions, mappingSiteTarget, orphanedMappings } from '../../src/ui/mapping-management';

interface Filters {
  query: string;
  site: string;
  profileKey: string;
  scopeKind: string;
}

const EMPTY_FILTERS: Filters = { query: '', site: '', profileKey: '', scopeKind: '' };

function scopeLabel(scope: MappingScope): string {
  if (scope.kind === 'global') return '所有网站';
  if (scope.kind === 'host') return '当前网站';
  return '当前页面';
}

export function MappingManager({ profile, mappingStore, refreshToken = 0 }: {
  profile: Profile;
  mappingStore: MappingStore;
  refreshToken?: number;
}) {
  const [mappings, setMappings] = useState<NormalizedUserFieldMapping[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState('');
  const [editProfileKey, setEditProfileKey] = useState('');
  const [editScopeKind, setEditScopeKind] = useState<MappingScope['kind']>('global');
  const [editHost, setEditHost] = useState('');
  const [editPath, setEditPath] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const profileOptions = useMemo(() => mappingProfileOptions(profile), [profile]);
  const orphaned = useMemo(() => orphanedMappings(mappings, profile), [mappings, profile]);
  const visible = useMemo(() => filterMappings(mappings, profile, filters), [mappings, profile, filters]);
  const sites = useMemo(() => [...new Set(mappings.map(mappingSiteTarget))].sort(), [mappings]);
  const allVisibleSelected = visible.length > 0 && visible.every((mapping) => selected.has(mapping.id));

  useEffect(() => {
    let active = true;
    void mappingStore.list().then((items) => {
      if (!active) return;
      setMappings(items);
      setSelected(new Set());
      setEditingId('');
    }).catch((error) => {
      if (active) setMessage(`读取映射失败：${error instanceof Error ? error.message : '未知错误'}`);
    });
    return () => { active = false; };
  }, [mappingStore, refreshToken]);

  useEffect(() => {
    setSelected(new Set());
  }, [filters]);

  function beginEdit(mapping: NormalizedUserFieldMapping) {
    setEditingId(mapping.id);
    setEditProfileKey(mapping.profileKey);
    setEditScopeKind(mapping.scope.kind);
    setEditHost(mapping.scope.kind === 'global' ? '' : mapping.scope.host);
    setEditPath(mapping.scope.kind === 'path' ? mapping.scope.path : '');
    setMessage('');
  }

  async function saveEdit(mapping: NormalizedUserFieldMapping) {
    const host = editHost.trim();
    const path = editPath.trim();
    if (!editProfileKey || (editScopeKind !== 'global' && !host) || (editScopeKind === 'path' && !path)) {
      setMessage('请完整选择资料字段，并填写网站和页面路径。');
      return;
    }
    const scope: MappingScope = editScopeKind === 'global'
      ? { kind: 'global' }
      : editScopeKind === 'host'
        ? { kind: 'host', host }
        : { kind: 'path', host, path: path.startsWith('/') ? path : `/${path}` };
    const updated = { ...mapping, id: createMappingId(mapping.fingerprint, editProfileKey, scope), profileKey: editProfileKey, scope };
    setBusy(true);
    try {
      await mappingStore.updateMapping(mapping.id, updated);
      setMappings(await mappingStore.list());
      setEditingId('');
      setSelected(new Set());
      setMessage('字段映射已更新。');
    } catch (error) {
      setMessage(`更新失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete.length) return;
    setBusy(true);
    try {
      await mappingStore.deleteMany(pendingDelete);
      setMappings(await mappingStore.list());
      setSelected(new Set());
      setPendingDelete([]);
      setMessage(`已删除 ${pendingDelete.length} 条字段映射。`);
    } catch (error) {
      setMessage(`删除失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setBusy(false);
    }
  }

  function toggleVisible() {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visible.forEach((mapping) => next.delete(mapping.id));
      else visible.forEach((mapping) => next.add(mapping.id));
      return next;
    });
  }

  return <section className="mapping-manager" aria-label="字段映射管理">
    <header className="mapping-header">
      <div><span className="eyebrow">已学习的招聘字段</span><h2>字段映射管理</h2><p>查看招聘网站字段与本地资料的关联；修改只影响后续扫描和填写。</p></div>
      <div className="mapping-stats"><strong>{mappings.length}</strong><span>条映射</span>{orphaned.length > 0 && <em>{orphaned.length} 条失效</em>}</div>
    </header>

    {orphaned.length > 0 && <div className="orphan-warning" role="alert"><div><strong>发现 {orphaned.length} 条失效映射</strong><p>这些映射指向已不存在的资料字段，可以重新关联或清理。</p></div><button type="button" className="danger-outline" onClick={() => setPendingDelete(orphaned.map((mapping) => mapping.id))}>清理失效映射</button></div>}

    <div className="mapping-filters">
      <label><span>搜索</span><input value={filters.query} placeholder="招聘字段、网站或资料字段" onChange={(event) => setFilters({ ...filters, query: event.target.value })} /></label>
      <label><span>网站</span><select value={filters.site} onChange={(event) => setFilters({ ...filters, site: event.target.value })}><option value="">全部网站</option>{sites.map((site) => <option key={site} value={site}>{site}</option>)}</select></label>
      <label><span>资料字段</span><select value={filters.profileKey} onChange={(event) => setFilters({ ...filters, profileKey: event.target.value })}><option value="">全部资料字段</option>{profileOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
      <label><span>范围</span><select value={filters.scopeKind} onChange={(event) => setFilters({ ...filters, scopeKind: event.target.value })}><option value="">全部范围</option><option value="global">所有网站</option><option value="host">当前网站</option><option value="path">当前页面</option></select></label>
    </div>

    <div className="mapping-toolbar">
      <label className="mapping-select-all"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} />选择当前结果</label>
      <span>已选 {selected.size} 条</span>
      <button type="button" className="danger-outline" disabled={!selected.size || busy} onClick={() => setPendingDelete([...selected])}>删除所选</button>
      {Object.values(filters).some(Boolean) && <button type="button" className="text-button" onClick={() => setFilters(EMPTY_FILTERS)}>清除筛选</button>}
    </div>

    {message && <p className="mapping-message" role="status">{message}</p>}
    {!mappings.length ? <div className="mapping-empty"><strong>还没有字段映射</strong><p>在预览页手动纠正一次字段后，映射会自动保存到这里。</p></div>
      : !visible.length ? <div className="mapping-empty"><strong>没有符合条件的映射</strong><p>可以调整筛选条件后重试。</p></div>
        : <div className="mapping-list">{visible.map((mapping) => {
          const isOrphaned = !profile.fields[mapping.profileKey];
          const editing = editingId === mapping.id;
          return <article key={mapping.id} className={`mapping-item${isOrphaned ? ' orphaned' : ''}`}>
            <div className="mapping-row-main">
              <input aria-label={`选择 ${mapping.fingerprint}`} type="checkbox" checked={selected.has(mapping.id)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(mapping.id)) next.delete(mapping.id); else next.add(mapping.id); return next; })} />
              <div className="mapping-copy"><div><strong>{mapping.fingerprint}</strong>{isOrphaned && <span className="warning-badge">资料字段已失效</span>}</div><p>{mappingSiteTarget(mapping)} · {scopeLabel(mapping.scope)}</p></div>
              <div className="mapping-target"><span>关联到</span><strong>{mappingProfileLabel(mapping, profile)}</strong><code>{mapping.profileKey}</code></div>
              <div className="mapping-row-actions"><button type="button" onClick={() => editing ? setEditingId('') : beginEdit(mapping)}>{editing ? '取消' : '编辑'}</button><button type="button" className="danger" onClick={() => setPendingDelete([mapping.id])}>删除</button></div>
            </div>
            {editing && <div className="mapping-editor">
              <label><span>本地资料字段</span><select value={editProfileKey} onChange={(event) => setEditProfileKey(event.target.value)}><option value="">请选择</option>{profileOptions.map((option) => <option key={option.key} value={option.key}>{option.label} · {option.key}</option>)}</select></label>
              <label><span>生效范围</span><select value={editScopeKind} onChange={(event) => setEditScopeKind(event.target.value as MappingScope['kind'])}><option value="global">所有网站</option><option value="host">当前网站</option><option value="path">当前页面</option></select></label>
              {editScopeKind !== 'global' && <label><span>网站域名</span><input value={editHost} placeholder="jobs.example.com" onChange={(event) => setEditHost(event.target.value)} /></label>}
              {editScopeKind === 'path' && <label><span>页面路径</span><input value={editPath} placeholder="/apply" onChange={(event) => setEditPath(event.target.value)} /></label>}
              <button type="button" disabled={busy} onClick={() => void saveEdit(mapping)}>保存映射</button>
            </div>}
          </article>;
        })}</div>}

    {pendingDelete.length > 0 && <div className="mapping-confirm" role="alertdialog" aria-label="确认删除字段映射"><div><strong>确认删除 {pendingDelete.length} 条字段映射？</strong><p>只会删除学习记录，不会删除个人资料。</p></div><div><button type="button" className="secondary" onClick={() => setPendingDelete([])}>取消</button><button type="button" className="danger" disabled={busy} onClick={() => void confirmDelete()}>{busy ? '正在删除…' : '确认删除'}</button></div></div>}
  </section>;
}
