import { useState, useEffect } from 'react';
import useMapStore from '../../store/useMapStore';
import {
  subscribeFactions,
  subscribeDiplomaticRelations,
  addFaction,
  updateFaction,
  deleteFaction,
  setDiplomaticRelation,
} from '../../firebase/factions';

// ── Constants ────────────────────────────────────────────────────────────────

const COLOR_PRESETS = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#22c55e', // green
  '#eab308', // yellow
  '#a855f7', // purple
  '#f97316', // orange
  '#06b6d4', // cyan
  '#ec4899', // pink
];

const RELATION_TYPES = [
  { key: 'ally',     label: '同盟', bg: 'bg-blue-900',   text: 'text-blue-300'   },
  { key: 'friendly', label: '友好', bg: 'bg-green-900',  text: 'text-green-300'  },
  { key: 'neutral',  label: '中立', bg: 'bg-gray-700',   text: 'text-gray-300'   },
  { key: 'tense',    label: '緊張', bg: 'bg-orange-900', text: 'text-orange-300' },
  { key: 'hostile',  label: '敵対', bg: 'bg-red-900',    text: 'text-red-300'    },
  { key: 'war',      label: '戦争', bg: 'bg-red-950',    text: 'text-red-200'    },
];

const EMPTY_FORM = { name: '', color: '#ef4444', capital: '', description: '' };

// ── Sub-components ───────────────────────────────────────────────────────────

/** Colored circle indicator */
function ColorDot({ color, size = 'w-3 h-3' }) {
  return (
    <span
      className={`inline-block ${size} rounded-full shrink-0`}
      style={{ backgroundColor: color }}
    />
  );
}

/** Relation type badge */
function RelationBadge({ relationType }) {
  const rt = RELATION_TYPES.find((r) => r.key === relationType);
  if (!rt) return null;
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${rt.bg} ${rt.text}`}>
      {rt.label}
    </span>
  );
}

// ── Add / Edit Form ──────────────────────────────────────────────────────────

function FactionForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial ?? EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-3 py-3 border-b border-gray-700 space-y-2">
      {/* Name */}
      <input
        autoFocus
        type="text"
        placeholder="勢力名"
        value={form.name}
        onChange={(e) => set('name', e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        className="w-full bg-gray-700 text-white text-xs rounded px-2 py-1.5 outline-none
                   border border-gray-600 focus:border-blue-500"
      />
      {/* Capital */}
      <input
        type="text"
        placeholder="首都都市名（任意）"
        value={form.capital}
        onChange={(e) => set('capital', e.target.value)}
        className="w-full bg-gray-700 text-white text-xs rounded px-2 py-1.5 outline-none
                   border border-gray-600 focus:border-blue-500"
      />
      {/* Description */}
      <input
        type="text"
        placeholder="メモ（任意）"
        value={form.description}
        onChange={(e) => set('description', e.target.value)}
        className="w-full bg-gray-700 text-white text-xs rounded px-2 py-1.5 outline-none
                   border border-gray-600 focus:border-blue-500"
      />
      {/* Color palette */}
      <div className="flex gap-1.5 flex-wrap">
        {COLOR_PRESETS.map((c) => (
          <button
            key={c}
            onClick={() => set('color', c)}
            className={`w-5 h-5 rounded-full transition-transform
              ${form.color === c ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      {/* Buttons */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving || !form.name.trim()}
          className="flex-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40
                     text-white rounded py-1 transition-colors"
        >
          {saving ? '保存中…' : '保存'}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded py-1"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}

// ── Diplomatic Relation Row ──────────────────────────────────────────────────

function DiplomaticRow({ faction, currentRelation, onChangeRelation }) {
  const [saving, setSaving] = useState(false);

  async function handleChange(e) {
    setSaving(true);
    try {
      await onChangeRelation(e.target.value);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5 py-1">
      <ColorDot color={faction.color} />
      <span className="flex-1 text-xs text-gray-300 truncate">{faction.name}</span>
      <select
        value={currentRelation ?? 'neutral'}
        onChange={handleChange}
        disabled={saving}
        className="text-xs bg-gray-700 text-gray-200 border border-gray-600 rounded px-1 py-0.5
                   outline-none focus:border-blue-500 disabled:opacity-50"
      >
        {RELATION_TYPES.map((rt) => (
          <option key={rt.key} value={rt.key}>{rt.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── Faction Item ─────────────────────────────────────────────────────────────

function FactionItem({ faction, isExpanded, onToggle, allFactions, onEdit, onDelete }) {
  const [relations, setRelations] = useState([]);
  const [editMode, setEditMode] = useState(false);

  // Subscribe to this faction's diplomatic relations when expanded
  useEffect(() => {
    if (!isExpanded) return;
    const unsub = subscribeDiplomaticRelations(faction.id, setRelations);
    return unsub;
  }, [isExpanded, faction.id]);

  const otherFactions = allFactions.filter((f) => f.id !== faction.id);
  const getRelation = (targetId) =>
    relations.find((r) => r.id === targetId)?.relationType ?? 'neutral';

  async function handleChangeRelation(targetId, relationType) {
    await setDiplomaticRelation(faction.id, targetId, relationType);
  }

  async function handleSaveEdit(form) {
    await updateFaction(faction.id, form);
    setEditMode(false);
  }

  return (
    <div className="border-b border-gray-700/50">
      {/* Row header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-700/50 transition-colors"
        onClick={onToggle}
      >
        <ColorDot color={faction.color} />
        <span className="flex-1 text-xs text-gray-200 truncate">{faction.name}</span>
        {faction.capital && (
          <span className="text-xs text-gray-500 truncate max-w-[60px]">{faction.capital}</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setEditMode((v) => !v); onToggle(); }}
          className="text-gray-500 hover:text-gray-300 text-xs px-1"
          title="編集"
        >
          ✏
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3">
          {editMode ? (
            <FactionForm
              initial={{ name: faction.name, color: faction.color, capital: faction.capital ?? '', description: faction.description ?? '' }}
              onSave={handleSaveEdit}
              onCancel={() => setEditMode(false)}
            />
          ) : null}

          {/* Diplomatic relations */}
          {otherFactions.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-1">外交関係</p>
              {otherFactions.map((other) => (
                <DiplomaticRow
                  key={other.id}
                  faction={other}
                  currentRelation={getRelation(other.id)}
                  onChangeRelation={(rt) => handleChangeRelation(other.id, rt)}
                />
              ))}
            </div>
          )}

          {/* Delete */}
          <button
            onClick={() => onDelete(faction.id)}
            className="mt-3 w-full text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20
                       rounded py-1 transition-colors"
          >
            勢力を削除
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Panel ───────────────────────────────────────────────────────────────

export default function FactionPanel() {
  const { factions, setFactions } = useMapStore();
  const [expandedId, setExpandedId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Subscribe to factions on mount
  useEffect(() => {
    const unsub = subscribeFactions(setFactions);
    return unsub;
  }, [setFactions]);

  function toggleExpand(id) {
    setExpandedId((prev) => (prev === id ? null : id));
    setShowAddForm(false);
  }

  async function handleAdd(form) {
    await addFaction(form);
    setShowAddForm(false);
  }

  async function handleDelete(id) {
    if (expandedId === id) setExpandedId(null);
    await deleteFaction(id);
  }

  return (
    <div className="hidden md:flex w-56 bg-gray-800 border-l border-gray-700 flex-col shrink-0">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between shrink-0">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">勢力</h2>
        <button
          onClick={() => { setShowAddForm((v) => !v); setExpandedId(null); }}
          className="text-gray-400 hover:text-white text-base leading-none transition-colors"
          title="勢力を追加"
        >
          {showAddForm ? '✕' : '+'}
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <FactionForm onSave={handleAdd} onCancel={() => setShowAddForm(false)} />
      )}

      {/* Faction list */}
      <div className="flex-1 overflow-y-auto">
        {factions.length === 0 && !showAddForm && (
          <p className="text-xs text-gray-600 text-center px-3 mt-6">
            [+] で勢力を追加
          </p>
        )}
        {factions.map((faction) => (
          <FactionItem
            key={faction.id}
            faction={faction}
            isExpanded={expandedId === faction.id}
            onToggle={() => toggleExpand(faction.id)}
            allFactions={factions}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}
