/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trash2,
  Underline,
  PlusCircle, 
  Copy,
  GitCompare,
  Search, 
  FolderOpen, 
  ArrowLeftRight, 
  HelpCircle, 
  Settings, 
  Gavel,
  History,
  Lightbulb,
  Sparkles,
  MoreVertical,
  MoreHorizontal,
  FileText,
  LayoutGrid,
  Info,
  X,
  CheckCircle2,
  Share2,
  Download,
  Plus,
  Menu,
  ExternalLink,
  Printer,
  ChevronDown,
  ChevronRight,
  Bold,
  Italic,
  Highlighter,
  Link2,
  List,
  Quote,
  Clock,
  PanelLeft,
  Home,
  PenLine
} from 'lucide-react';

// --- Types ---

enum ViewMode {
  HOME = 'home',
  ANALYSIS = 'analysis',
  COMPARISON = 'comparison'
}

enum HomeMode {
  SEARCH = 'search',
  ANALYSIS = 'analysis'
}

interface CaseItem {
  id: string;
  projectId?: string;
  name: string;
  type: string;
  cause: string;
  court: string;
  date: string;
  labels: string[];
  originalText?: string;
  analysisReport?: string;
  analysisMeta?: Record<string, string>;
  sourceFileName?: string;
  updatedAt?: string;
}

interface CaseGroup {
  id: string;
  name: string;
  cases: string[];
  expanded: boolean;
}

interface SearchIntent {
  rawQuery: string;
  keywords: string[];
  fullTextQuery: string;
  causeOfAction: string;
  caseName: string;
  caseNo: string;
  courtName: string;
  legalBasis: string[];
  courtLevel: '基层法院' | '中级法院' | '高级法院' | '最高法院' | '未指定';
  caseType: '民事' | '刑事' | '行政' | '执行' | '国家赔偿' | '未指定';
  region: string;
  dateRange: { start: string; end: string };
  partyRole: string;
  requestedCount: number;
  sortBy: '相关度' | '裁判日期';
  ambiguities: string[];
  searchPlan: string[];
  recommendedAdvancedFields: string[];
}

interface SearchRunOutput {
  status: 'ok' | 'needs_human' | 'error';
  intent: SearchIntent;
  resultUrl: string;
  nextAction: string;
  notes: string[];
}

// --- Data Mockups ---

const MOCK_CASES: CaseItem[] = [
  { id: '1', name: '张三诉李四借款合同纠纷', type: '民事', cause: '民间借贷', court: '基层人民法院', date: '2023-05-12', labels: ['民间借贷', '证据效力'] },
  { id: '2', name: '王五与某公司劳动争议', type: '民事', cause: '劳动合同纠纷', court: '中级人民法院', date: '2022-11-28', labels: ['违法解除', '经济补偿'] },
  { id: '3', name: '某建筑工程合同纠纷', type: '民事', cause: '建筑工程施工', court: '某仲裁委员会', date: '2024-01-15', labels: ['工期延误', '违约金'] },
];

const INITIAL_GROUPS = [
  { id: 'g1', name: '民法作业', cases: ['1', '2'], expanded: true },
  { id: 'g2', name: '行政案例调查', cases: ['3'], expanded: false },
];

interface Note {
  id: string;
  title: string;
  content: string;
  references?: string[];
  reference?: string;
  timestamp: string;
}

const INITIAL_NOTES: Note[] = [
  { 
    id: 'n1', 
    title: 'Critical Analysis: Secondary Appeal Strategy', 
    content: 'The highlight above confirms that the non-disclosure is the **pivotal element** for the litigation. We need to document the exact timing...\n\n- Review municipal ombudsman records from Sep-Dec 2023.\n- Compare discovery date against the 60-day filing window requirement.\n- Verify Appendix C indemnity scaling logic.\n\nWaiting for confirmation on the exact discovery timestamp from the client\'s internal audit team.',
    reference: 'Failure to provide adequate disclosure of liabilities...',
    timestamp: '14:02'
  }
];

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function createReferenceBlock(text: string) {
  return `<blockquote data-note-reference="true" class="my-3 rounded-r-xl border-l-4 border-accent-amber bg-[#FAF7F2] px-4 py-3 text-[12px] leading-relaxed text-[#6B5B4A]"><strong class="text-primary">引用原文：</strong>${escapeHtml(text)}</blockquote><p><br></p>`;
}

function getNoteReferences(note?: Note) {
  if (!note) return [];
  const references = [...(note.references || [])];
  if (note.reference && !references.includes(note.reference)) {
    references.push(note.reference);
  }
  return references;
}

function getNoteContentForEditor(note?: Note) {
  if (!note) return '<p><br></p>';
  const content = note.content || '';
  const referenceHtml = getNoteReferences(note)
    .filter(reference => !content.includes(escapeHtml(reference).slice(0, 20)))
    .map(createReferenceBlock)
    .join('');
  return content.trim() || referenceHtml ? `${content}${referenceHtml}` : '<p><br></p>';
}

function getNotePreview(note: Note) {
  const contentText = note.content
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (contentText) return contentText;
  const references = getNoteReferences(note);
  return references.length > 0 ? `引用 ${references.length} 段：${references[0]}` : '暂无内容...';
}

// --- Main App Component ---

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.HOME);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [homeMode, setHomeMode] = useState<HomeMode>(HomeMode.SEARCH);
  const [searchConfirmed, setSearchConfirmed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIntent, setSearchIntent] = useState<SearchIntent | null>(null);
  const [searchStatus, setSearchStatus] = useState<'idle' | 'mapping' | 'running'>('idle');
  const [searchError, setSearchError] = useState('');
  const [searchOutput, setSearchOutput] = useState<SearchRunOutput | null>(null);
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [manualDocumentText, setManualDocumentText] = useState('');
  const [documentStatus, setDocumentStatus] = useState<'idle' | 'analyzing'>('idle');
  const [documentError, setDocumentError] = useState('');
  const [splitPosition, setSplitPosition] = useState(50);
  const [activeCase, setActiveCase] = useState<CaseItem | null>(null);
  const [cases, setCases] = useState<CaseItem[]>(MOCK_CASES);
  const [groups, setGroups] = useState<CaseGroup[]>(INITIAL_GROUPS);
  const [activeProjectId, setActiveProjectId] = useState('g1');
  const [caseContextMenu, setCaseContextMenu] = useState<{ x: number, y: number, caseId: string } | null>(null);
  const [renamingCaseId, setRenamingCaseId] = useState<string | null>(null);
  const [renamingCaseName, setRenamingCaseName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [menuGroupId, setMenuGroupId] = useState<string | null>(null);
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [showNotes, setShowNotes] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [notes, setNotes] = useState<Note[]>(INITIAL_NOTES);
  const [currentNoteId, setCurrentNoteId] = useState<string>(INITIAL_NOTES[0].id);
  const [activeFormatting, setActiveFormatting] = useState<string[]>([]);
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  const [showEditorToolbar, setShowEditorToolbar] = useState(false);
  const [editorToolbarCoords, setEditorToolbarCoords] = useState<{ x: number, y: number } | null>(null);
  const [noteContextMenu, setNoteContextMenu] = useState<{ x: number, y: number, noteId: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  const editorRef = useRef<HTMLDivElement>(null);
  const currentNote = notes.find(n => n.id === currentNoteId) || notes[0];

  useEffect(() => {
    if (editorRef.current) {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    }
  }, []);

  useEffect(() => {
    refreshLibrary();
  }, []);

  useEffect(() => {
    if (editorRef.current && currentNote) {
      // Only sync if not focused or if it's a completely different note
      const isFocused = document.activeElement === editorRef.current;
      const contentMismatch = editorRef.current.innerHTML !== currentNote.content;
      
      if (!isFocused && contentMismatch) {
        editorRef.current.innerHTML = getNoteContentForEditor(currentNote);
      }
    }
  }, [currentNoteId, isEditingNote]);

  const addNote = (reference?: string) => {
    const newId = `n${Date.now()}`;
    const cleanReference = reference?.trim();
    const newNote: Note = {
      id: newId,
      title: '',
      content: cleanReference ? createReferenceBlock(cleanReference) : '',
      references: cleanReference ? [cleanReference] : [],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setNotes([newNote, ...notes]);
    setCurrentNoteId(newId);
    setIsEditingNote(true);
    setShowNotes(true);
  };

  const updateNote = (id: string, updates: Partial<Note>) => {
    setNotes(notes.map(n => n.id === id ? { ...n, ...updates } : n));
  };

  const deleteNote = (id: string) => {
    setNotes(notes.filter(n => n.id !== id));
    setDeleteConfirmId(null);
    setNoteContextMenu(null);
  };

  const toggleFormatting = (type: string) => {
    if (editorRef.current) {
      editorRef.current.focus();
      document.execCommand(type, false);
      const newContent = editorRef.current.innerHTML;
      updateNote(currentNoteId, { content: newContent });
    }
  };

  const applyHeading = (h: string | null) => {
    if (editorRef.current) {
      editorRef.current.focus();
      document.execCommand('formatBlock', false, h ? `<${h}>` : 'p');
      const newContent = editorRef.current.innerHTML;
      updateNote(currentNoteId, { content: newContent });
    }
  };

  const applyColor = (color: string | null) => {
    if (editorRef.current) {
      editorRef.current.focus();
      if (!color) {
        document.execCommand('removeFormat', false);
      } else {
        document.execCommand('backColor', false, color);
      }
      updateNote(currentNoteId, { content: editorRef.current.innerHTML });
    }
  };

  const handleNoteContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setNoteContextMenu({ x: e.clientX, y: e.clientY, noteId: id });
    setDeleteConfirmId(null);
  };

  // Close context menu on click elsewhere
  React.useEffect(() => {
    const handleClick = () => {
      setNoteContextMenu(null);
      setCaseContextMenu(null);
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const linkToSelection = () => {
    appendReferenceToCurrentNote(window.getSelection()?.toString() || '');
  };

  const appendReferenceToCurrentNote = (text: string) => {
    const cleanText = text.trim();
    if (!cleanText || !currentNote) return;

    const referenceBlock = createReferenceBlock(cleanText);
    let nextContent = `${currentNote.content || ''}${referenceBlock}`;

    if (editorRef.current && isEditingNote) {
      editorRef.current.focus();
      document.execCommand('insertHTML', false, referenceBlock);
      nextContent = editorRef.current.innerHTML;
    }

    updateNote(currentNoteId, {
      content: nextContent,
      references: [...getNoteReferences(currentNote), cleanText],
      reference: undefined
    });
  };

  const handleEditorSelect = () => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      let container: Node | null = range.commonAncestorContainer;
      while (container && container !== editorRef.current) {
        container = container.parentNode;
      }
      
      if (container === editorRef.current) {
        const rect = range.getBoundingClientRect();
        const toolbarWidth = 320; // Estimated width
        const margin = 20;
        let x = rect.left + rect.width / 2;
        
        // Clamp x to prevent overflow
        x = Math.max(toolbarWidth / 2 + margin, Math.min(x, window.innerWidth - toolbarWidth / 2 - margin));

        setEditorToolbarCoords({
          x,
          y: rect.top - 60
        });
        setShowEditorToolbar(true);
      } else {
        const activeElement = document.activeElement;
        if (!activeElement?.closest('.editor-toolbar')) {
          setShowEditorToolbar(false);
          setEditorToolbarCoords(null);
        }
      }
    } else {
      setTimeout(() => {
        const selectionAfter = window.getSelection();
        if (!selectionAfter || selectionAfter.isCollapsed) {
          const activeElement = document.activeElement;
          if (!activeElement?.closest('.editor-toolbar')) {
            setShowEditorToolbar(false);
            setEditorToolbarCoords(null);
          }
        }
      }, 150);
    }
  };
  
  const splitRef = useRef<HTMLDivElement>(null);

  const toggleSidebar = () => setSidebarCollapsed(!sidebarCollapsed);

  const toggleGroup = (id: string) => {
    setActiveProjectId(id);
    setGroups(groups.map(g => g.id === id ? { ...g, expanded: !g.expanded } : g));
  };

  const addGroup = () => {
    const newId = `g${Date.now()}`;
    setGroups([...groups, { id: newId, name: '新分类库', cases: [], expanded: true }]);
    setActiveProjectId(newId);
    setEditingGroupId(newId);
  };

  const updateGroupName = (id: string, name: string) => {
    setGroups(groups.map(g => g.id === id ? { ...g, name } : g));
  };

  const deleteGroup = (id: string) => {
    setGroups(groups.filter(g => g.id !== id));
  };

  const handleCaseContextMenu = (event: React.MouseEvent, caseId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setCaseContextMenu({ x: event.clientX, y: event.clientY, caseId });
  };

  const deleteCaseFromLibrary = async (caseId: string) => {
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}`, { method: 'DELETE' });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.library) {
        setGroups(data.library.projects);
        setCases(data.library.cases.length > 0 ? data.library.cases : []);
      } else {
        setCases(prev => prev.filter(item => item.id !== caseId));
        setGroups(prev => prev.map(group => ({ ...group, cases: group.cases.filter(id => id !== caseId) })));
      }
      if (activeCase?.id === caseId) {
        setActiveCase(null);
        setViewMode(ViewMode.HOME);
      }
    } finally {
      setCaseContextMenu(null);
    }
  };

  const startRenameCase = (caseId: string) => {
    const target = cases.find(item => item.id === caseId);
    setRenamingCaseId(caseId);
    setRenamingCaseName(target?.name || '');
    setCaseContextMenu(null);
  };

  const commitRenameCase = async () => {
    if (!renamingCaseId) return;
    const nextName = renamingCaseName.trim();
    if (!nextName) {
      setRenamingCaseId(null);
      return;
    }

    const caseId = renamingCaseId;
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nextName })
      });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.library) {
        setGroups(data.library.projects);
        setCases(data.library.cases);
        const renamed = data.library.cases.find((item: CaseItem) => item.id === caseId);
        if (activeCase?.id === caseId && renamed) setActiveCase(renamed);
      } else {
        setCases(prev => prev.map(item => item.id === caseId ? { ...item, name: nextName } : item));
        if (activeCase?.id === caseId) setActiveCase({ ...activeCase, name: nextName });
      }
    } finally {
      setRenamingCaseId(null);
      setRenamingCaseName('');
    }
  };

  const handleCaseSelectForComparison = (id: string) => {
    if (selectedCaseIds.includes(id)) {
      setSelectedCaseIds(selectedCaseIds.filter(i => i !== id));
    } else if (selectedCaseIds.length < 5) {
      setSelectedCaseIds([...selectedCaseIds, id]);
    }
  };

  // Resize handler for split pane
  const onMouseMove = (e: MouseEvent) => {
    if (!splitRef.current) return;
    const rect = splitRef.current.getBoundingClientRect();
    const position = ((e.clientX - rect.left) / rect.width) * 100;
    if (position > 25 && position < 75) {
      setSplitPosition(position);
    }
  };

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  const startResizing = () => {
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleAddToNoteFromSelection = (text: string) => {
    const newId = `n${Date.now()}`;
    const cleanText = text.trim();
    const newNote: Note = {
      id: newId,
      title: '',
      content: cleanText ? createReferenceBlock(cleanText) : '',
      references: cleanText ? [cleanText] : [],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setNotes([newNote, ...notes]);
    setCurrentNoteId(newId);
    setIsEditingNote(true);
    setShowNotes(true);
  };

  const refreshLibrary = async () => {
    try {
      const response = await fetch('/api/library');
      if (!response.ok) return;
      const library = await response.json();
      if (Array.isArray(library.projects)) {
        const loadedGroups = library.projects.map((project: CaseGroup) => ({
          ...project,
          expanded: project.expanded ?? true
        }));
        setGroups(loadedGroups.length > 0 ? loadedGroups : INITIAL_GROUPS);
        if (loadedGroups.length > 0 && !loadedGroups.some((group: CaseGroup) => group.id === activeProjectId)) {
          setActiveProjectId(loadedGroups[0].id);
        }
      }
      if (Array.isArray(library.cases) && library.cases.length > 0) {
        setCases(library.cases);
      }
    } catch {
      // Keep bundled demo cases when the local API is not available.
    }
  };

  const analyzeDocuments = async () => {
    if (documentFiles.length === 0 && !manualDocumentText.trim()) {
      setDocumentError('请上传 Word/TXT/MD 文件，或粘贴文书文本。');
      return;
    }

    const formData = new FormData();
    formData.append('projectId', activeProjectId);
    formData.append('manualText', manualDocumentText);
    formData.append('manualTitle', '手动录入文书');
    documentFiles.forEach((file) => formData.append('files', file));

    setDocumentStatus('analyzing');
    setDocumentError('');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 180_000);
    try {
      const response = await fetch('/api/documents/analyze', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || '文书解析失败');
      }
      if (data.library) {
        setGroups(data.library.projects);
        setCases(data.library.cases);
      }
      if (Array.isArray(data.cases) && data.cases[0]) {
        setActiveCase(data.cases[0]);
        setViewMode(ViewMode.ANALYSIS);
      }
      setDocumentFiles([]);
      setManualDocumentText('');
    } catch (error) {
      setDocumentError(error instanceof DOMException && error.name === 'AbortError'
        ? '文书解析超过 180 秒未返回，请检查 AI 接口配置或稍后重试。'
        : error instanceof Error ? error.message : '文书解析失败');
    } finally {
      window.clearTimeout(timeout);
      setDocumentStatus('idle');
    }
  };

  const resetSearchFlow = () => {
    setSearchConfirmed(false);
    setSearchIntent(null);
    setSearchError('');
    setSearchOutput(null);
    setSearchStatus('idle');
  };

  const requestSearchIntent = async () => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchError('请先输入要检索的案例需求。');
      return;
    }

    setSearchStatus('mapping');
    setSearchError('');
    setSearchOutput(null);

    try {
      const response = await fetch('/api/search/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || '检索字段解析失败');
      }
      setSearchIntent(data.intent);
      setSearchConfirmed(true);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : '检索字段解析失败');
    } finally {
      setSearchStatus('idle');
    }
  };

  const runConfirmedSearch = async (intent: SearchIntent) => {
    setSearchStatus('running');
    setSearchError('');
    setSearchOutput(null);

    try {
      const response = await fetch('/api/search/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || '检索执行失败');
      }
      setSearchOutput(data.output);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : '检索执行失败');
    } finally {
      setSearchStatus('idle');
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-canvas font-sans selection:bg-primary/20 selection:text-primary">
      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 0 : 288 }}
        className="relative flex flex-col bg-surface-soft border-r border-hairline overflow-hidden z-40 shrink-0"
      >
        <div className="p-6 flex flex-col gap-6 h-full min-w-[288px]">
          {/* Logo Section */}
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-primary flex items-center justify-center rounded-lg shadow-sm">
                <Gavel className="text-white w-6 h-6" />
             </div>
             <div className="overflow-hidden">
                <h2 className="text-xl font-bold text-primary whitespace-nowrap leading-tight">稽案录</h2>
                <p className="text-[10px] text-muted tracking-widest uppercase whitespace-nowrap">Ji An Lu Workbench</p>
             </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted w-4 h-4" />
            <input 
              type="text" 
              placeholder="搜索案例..." 
              className="w-full pl-9 pr-4 py-2 bg-white border border-hairline rounded-xl text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all"
            />
          </div>

          <nav className="flex-grow space-y-1 overflow-y-auto no-scrollbar pb-4">
            <button 
              onClick={() => setViewMode(ViewMode.COMPARISON)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${
                viewMode === ViewMode.COMPARISON 
                  ? 'bg-surface-cream-strong/60 text-primary font-bold shadow-sm' 
                  : 'text-muted hover:bg-surface-cream-strong/30 hover:text-primary'
              }`}
            >
              <GitCompare size={20} />
              <span>案例对比</span>
            </button>

            <div className="mt-8 mb-4 px-4 flex items-center justify-between group/title">
               <span className="text-sm font-bold text-ink tracking-wide">我的案例库</span>
               <button 
                onClick={addGroup}
                className="p-1 hover:bg-white rounded-md text-muted-soft hover:text-primary transition-all opacity-0 group-hover/title:opacity-100"
               >
                 <Plus size={16} />
               </button>
            </div>

            {groups.map(group => (
              <div key={group.id} className="mb-1 relative">
                <div 
                  onClick={() => toggleGroup(group.id)}
                  className="flex items-center justify-between px-4 py-2.5 text-muted hover:text-primary cursor-pointer group/item rounded-xl hover:bg-white/40 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <FolderOpen size={18} className={`${group.expanded ? 'text-primary' : 'text-primary/70'}`} />
                    {editingGroupId === group.id ? (
                      <input 
                        autoFocus
                        className="bg-white border border-primary/30 rounded px-1 py-0.5 text-sm outline-none w-32"
                        value={group.name}
                        onChange={(e) => updateGroupName(group.id, e.target.value)}
                        onBlur={() => setEditingGroupId(null)}
                        onKeyDown={(e) => e.key === 'Enter' && setEditingGroupId(null)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className={`text-sm ${group.expanded ? 'font-bold text-primary' : 'font-medium'}`}>{group.name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center relative">
                       <button 
                        onClick={(e) => { e.stopPropagation(); setMenuGroupId(menuGroupId === group.id ? null : group.id); }}
                        className="p-1 hover:text-primary"
                       >
                         <MoreHorizontal size={16} />
                       </button>
                       {menuGroupId === group.id && (
                         <div className="absolute right-0 top-full mt-1 bg-white border border-hairline shadow-xl rounded-xl py-1 z-50 w-24 overflow-hidden editorial-shadow">
                            <button 
                              onClick={(e) => { e.stopPropagation(); setEditingGroupId(group.id); setMenuGroupId(null); }}
                              className="w-full text-left px-3 py-1.5 text-xs hover:bg-surface-soft text-muted hover:text-primary transition-all"
                            >
                              重命名
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); deleteGroup(group.id); setMenuGroupId(null); }}
                              className="w-full text-left px-3 py-1.5 text-xs hover:bg-red-50 text-red-500 transition-all"
                            >
                              删除
                            </button>
                         </div>
                       )}
                    </div>
                    {group.expanded ? <ChevronDown size={14} className="text-muted-soft" /> : <ChevronRight size={14} className="text-muted-soft" />}
                  </div>
                </div>
                
                {group.expanded && (
                  <div className="ml-5 pl-4 space-y-1 border-l border-hairline/80 mt-1 mb-2">
                    {group.cases.map(caseId => {
                      const c = cases.find(cas => cas.id === caseId);
                      const isActive = activeCase?.id === caseId && viewMode === ViewMode.ANALYSIS;
                      return (
                        <button 
                          key={caseId}
                          onContextMenu={(event) => handleCaseContextMenu(event, caseId)}
                          onClick={() => {
                            setActiveCase(c || null);
                            setViewMode(ViewMode.ANALYSIS);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm rounded-lg transition-all flex items-center relative ${
                            isActive 
                              ? 'bg-white text-primary font-bold shadow-sm border-l-4 border-primary ml-[-1px]' 
                              : 'text-muted hover:text-primary hover:bg-white/40'
                          }`}
                        >
                          {renamingCaseId === caseId ? (
                            <input
                              autoFocus
                              value={renamingCaseName}
                              onChange={(event) => setRenamingCaseName(event.target.value)}
                              onBlur={commitRenameCase}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') commitRenameCase();
                                if (event.key === 'Escape') setRenamingCaseId(null);
                              }}
                              onClick={(event) => event.stopPropagation()}
                              className="w-full bg-white border border-primary/30 rounded px-2 py-1 text-xs outline-none"
                            />
                          ) : (
                            <span className="truncate">{c?.name}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </nav>


          <div className="mt-auto pt-4 border-t border-hairline space-y-1">
            <div className="px-4 py-3 text-muted-soft select-none">
              <span className="text-sm italic">by Raysuki</span>
            </div>
          </div>
        </div>
      </motion.aside>

      {caseContextMenu && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="fixed z-[120] bg-white border border-hairline rounded-xl shadow-2xl py-1 w-32 editorial-shadow"
          style={{ left: caseContextMenu.x, top: caseContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            onClick={() => startRenameCase(caseContextMenu.caseId)}
            className="w-full px-3 py-2 text-left text-xs text-muted hover:bg-surface-soft hover:text-primary flex items-center gap-2"
          >
            <PenLine size={14} />
            <span>重命名</span>
          </button>
          <button
            onClick={() => deleteCaseFromLibrary(caseContextMenu.caseId)}
            className="w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
          >
            <Trash2 size={14} />
            <span>删除案例</span>
          </button>
        </motion.div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 relative h-full">
        {/* Top Header */}
        <header className="bg-surface/80 backdrop-blur-md border-b border-hairline h-16 flex items-center justify-between px-6 z-30 shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={toggleSidebar}
              className="p-2 hover:bg-surface-soft rounded-lg text-muted transition-colors flex items-center justify-center"
              title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
            >
              <PanelLeft size={20} />
            </button>
            <button 
              onClick={() => { setViewMode(ViewMode.HOME); resetSearchFlow(); }}
              className="p-2 hover:bg-surface-soft rounded-lg text-muted transition-colors flex items-center justify-center"
              title="返回工作台首页"
            >
              <Home size={20} />
            </button>
            <div className="h-4 w-px bg-hairline" />
            <span className="text-sm text-muted-soft italic font-serif hidden sm:inline">稽古明法，录案存真。</span>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-4 text-muted">
               <button className="hover:text-primary transition-colors"><HelpCircle size={20} /></button>
               <button className="hover:text-primary transition-colors"><Settings size={20} /></button>
            </div>
            <div className="flex items-center gap-3 pl-6 border-l border-hairline cursor-pointer group">
              <div className="w-8 h-8 rounded-full bg-surface-cream-strong border border-hairline overflow-hidden">
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=LegalTech`} alt="Avatar" className="w-full h-full object-cover" />
              </div>
              <span className="text-sm font-medium text-ink group-hover:text-primary transition-colors">法学研子</span>
            </div>
          </div>
        </header>

        {/* View Router */}
        <main className="flex-1 min-h-0 bg-canvas relative overflow-hidden">
          {viewMode === ViewMode.HOME && (
            <HomeView 
              mode={homeMode} 
              onSwitchMode={onHomeModeChange} 
              searchConfirmed={searchConfirmed}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              searchIntent={searchIntent}
              searchStatus={searchStatus}
              searchError={searchError}
              searchOutput={searchOutput}
              documentFiles={documentFiles}
              manualDocumentText={manualDocumentText}
              documentStatus={documentStatus}
              documentError={documentError}
              activeProjectName={groups.find(group => group.id === activeProjectId)?.name || '默认案例库'}
              onConfirmSearch={requestSearchIntent}
              onUpdateIntent={setSearchIntent}
              onRunSearch={runConfirmedSearch}
              onResetSearch={resetSearchFlow}
              onDocumentFilesChange={setDocumentFiles}
              onManualDocumentTextChange={setManualDocumentText}
              onAnalyzeDocuments={analyzeDocuments}
            />
          )}
          {viewMode === ViewMode.ANALYSIS && (activeCase ? 
            <AnalysisView 
              caseData={activeCase} 
              splitPosition={splitPosition} 
              startResizing={startResizing} 
              splitRef={splitRef} 
              onAddToNote={handleAddToNoteFromSelection}
            /> : <div className="p-20 text-center text-muted font-serif">请从左侧案例库选择一个文书进行解析</div>
          )}
          {viewMode === ViewMode.COMPARISON && (
            <ComparisonView 
              selectedCaseIds={selectedCaseIds} 
              onSelectCase={handleCaseSelectForComparison}
              allCases={cases}
              groups={groups}
            />
          )}

          {/* Floating Notes Trigger */}
          {viewMode === ViewMode.ANALYSIS && activeCase && (
            <>
              <button 
                onClick={() => setShowNotes(!showNotes)}
                className={`fixed bottom-8 right-8 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all z-50 active:scale-90 ${
                  showNotes ? 'bg-primary text-white rotate-90' : 'bg-primary text-white hover:-translate-y-1'
                }`}
              >
                {showNotes ? <X size={24} /> : <PenLine size={24} />}
              </button>

              <AnimatePresence>
                {showNotes && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9, y: 50, x: 50 }}
                    animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 50, x: 50 }}
                    className="fixed bottom-24 right-8 w-[400px] h-[600px] bg-[#FDFBF9] border border-[#E5DFD4] shadow-2xl rounded-[32px] overflow-hidden z-50 flex flex-col font-sans border-t-8 border-t-primary/20"
                  >
                    {!isEditingNote ? (
                      /* List View */
                      <>
                        <div className="px-8 py-6 border-b border-hairline flex items-center justify-between shrink-0 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
                          <h3 className="text-xl font-bold text-[#5C4D3D] italic">My Notes</h3>
                          <button 
                            onClick={() => {
                              const newId = `n${Date.now()}`;
                              const newNote: Note = {
                                id: newId,
                                title: '',
                                content: '',
                                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              };
                              setNotes([newNote, ...notes]);
                              setCurrentNoteId(newId);
                              setIsEditingNote(true);
                            }}
                            className="w-10 h-10 bg-primary text-white rounded-2xl flex items-center justify-center hover:bg-primary-active transition-all shadow-lg shadow-primary/20 hover:-translate-y-0.5 active:translate-y-0"
                            title="新建笔记"
                          >
                            <Plus size={20} />
                          </button>
                        </div>
                         <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar relative">
                           {notes.length === 0 ? (
                             <div className="h-full flex flex-col items-center justify-center text-muted-soft gap-3 opacity-60">
                                <PenLine size={48} className="stroke-[1.5]" />
                                <p className="text-sm">暂无笔记，点击上方“+”开始记录</p>
                             </div>
                           ) : (
                             notes.map(note => (
                               <div key={note.id} className="relative">
                                  <div 
                                    onClick={() => { setCurrentNoteId(note.id); setIsEditingNote(true); }}
                                    onContextMenu={(e) => handleNoteContextMenu(e, note.id)}
                                    className="p-5 rounded-2xl bg-white border border-[#F0EDE6] hover:border-primary/20 hover:shadow-xl transition-all cursor-pointer group animate-in fade-in slide-in-from-bottom-2 relative z-10"
                                  >
                                      {note.title.trim() && (
                                        <div className="flex justify-between items-start mb-2">
                                           <h4 className="text-sm font-bold text-[#5C4D3D] leading-tight group-hover:text-primary transition-colors flex-1 mr-2">{note.title}</h4>
                                           <span className="text-[10px] text-[#B5A99E] shrink-0">{note.timestamp}</span>
                                        </div>
                                      )}
                                      {!note.title.trim() && (
                                        <div className="flex justify-end mb-2">
                                           <span className="text-[10px] text-[#B5A99E] shrink-0">{note.timestamp}</span>
                                        </div>
                                      )}
                                      <p className="text-[12px] text-[#8B7E74] line-clamp-2 leading-relaxed mb-3">
                                         {getNotePreview(note)}
                                      </p>
                                      {getNoteReferences(note).length > 0 && (
                                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#FDF2EC] text-[#E97451] rounded-lg text-[10px] font-bold">
                                           <Link2 size={10} />
                                           <span className="max-w-[200px] truncate">引用 {getNoteReferences(note).length} 段原文</span>
                                        </div>
                                      )}
                                  </div>
                               </div>
                             ))
                           )}

                           {/* Note Context Menu */}
                           <AnimatePresence>
                             {noteContextMenu && (
                               <motion.div 
                                 initial={{ opacity: 0, scale: 0.95 }}
                                 animate={{ opacity: 1, scale: 1 }}
                                 exit={{ opacity: 0, scale: 0.95 }}
                                 style={{ 
                                   position: 'fixed', 
                                   left: noteContextMenu.x, 
                                   top: noteContextMenu.y,
                                   zIndex: 1000 
                                 }}
                                 className="w-32 bg-white border border-[#E5DFD4] shadow-2xl rounded-xl py-1 overflow-hidden"
                                 onClick={(e) => e.stopPropagation()}
                               >
                                  {deleteConfirmId === noteContextMenu.noteId ? (
                                    <button 
                                      onClick={() => deleteNote(noteContextMenu.noteId)}
                                      className="w-full text-left px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-50 transition-colors"
                                    >
                                      确认删除？
                                    </button>
                                  ) : (
                                    <button 
                                      onClick={() => setDeleteConfirmId(noteContextMenu.noteId)}
                                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                                    >
                                      <Trash2 size={14} />
                                      <span>删除笔记</span>
                                    </button>
                                  )}
                               </motion.div>
                             )}
                           </AnimatePresence>
                        </div>
                      </>
                    ) : (
                      /* Editor View */
                      <div className="flex-1 flex flex-col h-full bg-white animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-[#E5DFD4] bg-[#FAF7F2] flex items-center justify-between shrink-0">
                           <button 
                            onClick={() => setIsEditingNote(false)}
                            className="p-2 text-muted hover:text-primary transition-colors flex items-center gap-2"
                           >
                             <ChevronDown className="rotate-90" size={20} />
                             <span className="text-sm font-bold">返回列表</span>
                           </button>

                           <button 
                            onClick={linkToSelection}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold text-[#8B5E3C] hover:bg-primary/5 hover:text-primary transition-all border border-[#E5DFD4]"
                           >
                              <Link2 size={12} />
                              <span>引用原文</span>
                           </button>
                        </div>

                         <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col relative group/editor">
                           {/* Contextual Floating Toolbar (Selection-based) */}
                           <AnimatePresence>
                             {showEditorToolbar && editorToolbarCoords && (
                               <motion.div 
                                 initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                 animate={{ opacity: 1, scale: 1, y: 0 }}
                                 exit={{ opacity: 0, scale: 0.9, y: 10 }}
                                 style={{ 
                                   position: 'fixed',
                                   left: editorToolbarCoords.x,
                                   top: editorToolbarCoords.y,
                                   transform: 'translateX(-50%)',
                                   zIndex: 1000 
                                 }}
                                 className="pointer-events-auto editor-toolbar"
                               >
                                  <div className="flex items-center gap-1 p-1 bg-white border border-[#E5DFD4] shadow-[0_15px_50px_rgba(0,0,0,0.15)] rounded-2xl whitespace-nowrap">
                                     <div className="flex items-center gap-0.5 px-1">
                                       <button 
                                         onMouseDown={(e) => e.preventDefault()}
                                         onClick={() => applyHeading(null)} 
                                         className="w-8 h-8 rounded-lg text-[13px] font-bold text-[#8B7E74] hover:bg-black/5 flex items-center justify-center transition-all"
                                         title="清除格式"
                                       >
                                         T
                                       </button>
                                       {[1, 2, 3].map(h => (
                                         <button 
                                           key={h}
                                           onMouseDown={(e) => e.preventDefault()}
                                           onClick={() => applyHeading(`h${h}`)}
                                           className="w-8 h-8 rounded-lg text-[12px] font-black text-[#8B7E74] hover:bg-black/5 flex items-center justify-center transition-all"
                                           title={`标题 ${h}`}
                                         >
                                           H{h}
                                         </button>
                                       ))}
                                     </div>
                                     
                                     <div className="w-px h-6 bg-[#E5DFD4] mx-1" />
                                     
                                     <div className="flex items-center gap-0.5 px-1">
                                       <button 
                                         onMouseDown={(e) => e.preventDefault()} 
                                         onClick={() => toggleFormatting('bold')} 
                                         className="w-8 h-8 rounded-lg text-[#5C4D3D] hover:bg-black/5 flex items-center justify-center transition-all"
                                         title="加粗"
                                       >
                                         <Bold size={16} />
                                       </button>
                                       <button 
                                         onMouseDown={(e) => e.preventDefault()} 
                                         onClick={() => toggleFormatting('italic')} 
                                         className="w-8 h-8 rounded-lg text-[#5C4D3D] hover:bg-black/5 flex items-center justify-center transition-all"
                                         title="斜体"
                                       >
                                         <Italic size={16} />
                                       </button>
                                       <button 
                                         onMouseDown={(e) => e.preventDefault()} 
                                         onClick={() => applyColor('#FFF2CC')} 
                                         className="w-8 h-8 rounded-lg text-accent-amber hover:bg-black/5 flex items-center justify-center transition-all"
                                         title="高亮"
                                       >
                                         <Highlighter size={16} />
                                       </button>
                                     </div>

                                     <div className="w-px h-6 bg-[#E5DFD4] mx-1" />
                                     
                                     <button 
                                       onMouseDown={(e) => e.preventDefault()} 
                                       onClick={() => {
                                         document.execCommand('insertUnorderedList');
                                         if (editorRef.current) updateNote(currentNoteId, { content: editorRef.current.innerHTML });
                                       }} 
                                       className="w-8 h-8 rounded-lg text-[#5C4D3D] hover:bg-black/5 flex items-center justify-center transition-all"
                                       title="列表"
                                     >
                                       <List size={16} />
                                     </button>
                                  </div>
                               </motion.div>
                             )}
                           </AnimatePresence>

                           <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-[#FAF7F2]">
                               <input 
                                 className="w-full text-lg font-bold text-[#5C4D3D] outline-none placeholder:text-[#B5A99E] bg-transparent"
                                 placeholder="未命名笔记"
                                 value={currentNote?.title || ""}
                                 onChange={(e) => updateNote(currentNoteId, { title: e.target.value })}
                               />
                            </div>

                           <div className="flex-1 p-6 pt-2 space-y-4">
<div 
                                 ref={editorRef}
                                 contentEditable
                                 onInput={(e) => {
                                   updateNote(currentNoteId, { content: e.currentTarget.innerHTML });
                                 }}
                                 onBlur={() => {
                                   if (editorRef.current) updateNote(currentNoteId, { content: editorRef.current.innerHTML });
                                 }}
                                 onMouseUp={handleEditorSelect}
                                 onKeyUp={handleEditorSelect}
                                 className="w-full flex-1 min-h-[350px] bg-transparent text-sm text-[#5C4D3D] leading-relaxed outline-none focus:ring-0 editor-content"
                                 style={{
                                   fontSize: '0.875rem'
                                 }}
                              />
                           </div>
                        </div>

                        <div className="p-6 border-t border-[#E5DFD4] bg-[#FDFBF9] flex items-center justify-between shrink-0">
                           <span className="text-[11px] text-[#B5A99E]">上次编辑于 {currentNote?.timestamp}</span>
                           <button 
                             onClick={() => setIsEditingNote(false)}
                             className="bg-primary text-white px-10 py-3 rounded-2xl text-sm font-bold shadow-xl shadow-primary/20 hover:bg-primary-active transition-all active:scale-95"
                           >
                             保存并退出
                           </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </main>
      </div>
    </div>
  );

  function onHomeModeChange(m: HomeMode) {
    setHomeMode(m);
    resetSearchFlow();
  }
}

// --- View Components ---

function HomeView({ 
  mode, 
  onSwitchMode, 
  searchConfirmed,
  searchQuery,
  onSearchQueryChange,
  searchIntent,
  searchStatus,
  searchError,
  searchOutput,
  documentFiles,
  manualDocumentText,
  documentStatus,
  documentError,
  activeProjectName,
  onConfirmSearch,
  onUpdateIntent,
  onRunSearch,
  onResetSearch,
  onDocumentFilesChange,
  onManualDocumentTextChange,
  onAnalyzeDocuments
}: { 
  mode: HomeMode, 
  onSwitchMode: (m: HomeMode) => void,
  searchConfirmed: boolean,
  searchQuery: string,
  onSearchQueryChange: (value: string) => void,
  searchIntent: SearchIntent | null,
  searchStatus: 'idle' | 'mapping' | 'running',
  searchError: string,
  searchOutput: SearchRunOutput | null,
  documentFiles: File[],
  manualDocumentText: string,
  documentStatus: 'idle' | 'analyzing',
  documentError: string,
  activeProjectName: string,
  onConfirmSearch: () => void,
  onUpdateIntent: (intent: SearchIntent) => void,
  onRunSearch: (intent: SearchIntent) => void,
  onResetSearch: () => void,
  onDocumentFilesChange: (files: File[]) => void,
  onManualDocumentTextChange: (value: string) => void,
  onAnalyzeDocuments: () => void
}) {
  return (
    <div className="h-full w-full flex flex-col justify-center items-center py-8 px-6 overflow-hidden">
      <div className="w-full max-w-4xl flex flex-col items-center">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold font-serif mb-4 text-ink tracking-tight">法学案例学习工作台</h1>
          <p className="text-muted text-base max-w-xl mx-auto font-medium">
            融合 AI 的专业法律研究环境，助力精准案例检索与深度文书解析。
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="bg-surface-cream-strong/30 p-1 rounded-2xl mb-8 border border-hairline inline-flex shadow-sm">
          <button 
            onClick={() => onSwitchMode(HomeMode.SEARCH)}
            className={`px-8 py-2.5 rounded-xl flex items-center gap-2 transition-all text-sm ${
              mode === HomeMode.SEARCH ? 'bg-white text-primary font-bold shadow-md' : 'text-muted-soft hover:text-primary'
            }`}
          >
            <Search size={16} />
            <span>智能检索</span>
          </button>
          <button 
            onClick={() => onSwitchMode(HomeMode.ANALYSIS)}
            className={`px-8 py-2.5 rounded-xl flex items-center gap-2 transition-all text-sm ${
              mode === HomeMode.ANALYSIS ? 'bg-white text-primary font-bold shadow-md' : 'text-muted-soft hover:text-primary'
            }`}
          >
            <FileText size={16} />
            <span>文书解析</span>
          </button>
        </div>

        {/* Search Input or Analysis Input */}
        <AnimatePresence mode="wait">
          {!searchConfirmed ? (
            <motion.div 
              key={mode}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="w-full bg-surface-card border border-hairline rounded-3xl p-8 shadow-lg relative group overflow-hidden editorial-shadow"
            >
              <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-6 transition-opacity pointer-events-none">
                {mode === HomeMode.SEARCH ? <Search size={140} /> : <FileText size={140} />}
              </div>

              <div className="relative z-10">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-bold text-primary tracking-[0.2em] uppercase">
                    {mode === HomeMode.SEARCH ? 'Input Queries' : 'Analysis Input'}
                  </span>
                  <div className="flex gap-2">
                    <div className="w-2 h-2 rounded-full bg-accent-teal/40" />
                    <div className="w-2 h-2 rounded-full bg-accent-amber/40" />
                  </div>
                </div>

                {mode === HomeMode.SEARCH ? (
                  <div className="space-y-4">
                    <textarea 
                      value={searchQuery}
                      onChange={(event) => onSearchQueryChange(event.target.value)}
                      className="w-full min-h-[120px] bg-transparent border-none focus:ring-0 text-xl font-serif placeholder:text-muted/30 resize-none leading-relaxed"
                      placeholder="请输入你想查找的案例，例如：我想找大学生被学校开除后起诉高校的行政案件"
                    />
                    {searchError && (
                      <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-600">
                        {searchError}
                      </div>
                    )}
                    <div className="flex flex-col sm:flex-row justify-between items-center pt-6 border-t border-hairline-soft gap-4">
                      <div className="flex items-center gap-6 text-muted-soft">
                        <button className="flex items-center gap-2 hover:text-primary transition-colors">
                          <History size={16} />
                          <span className="text-xs font-medium">最近历史</span>
                        </button>
                      </div>
                      <button 
                        onClick={onConfirmSearch}
                        disabled={searchStatus === 'mapping'}
                        className="px-8 py-3 bg-primary text-white rounded-xl shadow-xl hover:bg-primary-active transition-all font-bold flex items-center justify-center gap-2 active:scale-95 text-sm"
                      >
                        <Sparkles size={16} className={searchStatus === 'mapping' ? 'animate-pulse fill-white' : 'fill-white'} />
                        <span>{searchStatus === 'mapping' ? '正在解析字段...' : 'AI 辅助检索'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between rounded-xl border border-hairline bg-white/40 px-4 py-3">
                      <span className="text-xs text-muted">解析后自动加入</span>
                      <span className="text-xs font-bold text-primary">{activeProjectName}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                      <label className="border-2 border-dashed border-hairline rounded-2xl p-6 flex flex-col items-center justify-center bg-white/30 hover:bg-white hover:border-primary transition-all cursor-pointer group/upload min-h-[180px]">
                         <Plus size={36} className="text-muted-soft group-hover:text-primary mb-2 transition-colors" />
                         <p className="font-bold text-sm text-ink mb-1">点击或拖拽文件至此</p>
                         <p className="text-[10px] text-muted-soft">支持 DOC, DOCX, TXT, MD 格式</p>
                         <input
                          type="file"
                          multiple
                          accept=".doc,.docx,.txt,.md,.markdown"
                          className="hidden"
                          onChange={(event) => onDocumentFilesChange(Array.from(event.target.files || []))}
                         />
                         {documentFiles.length > 0 && (
                          <div className="mt-4 w-full space-y-1">
                            {documentFiles.map((file) => (
                              <div key={`${file.name}-${file.size}`} className="truncate rounded-lg bg-white border border-hairline px-3 py-1.5 text-[11px] text-muted">
                                {file.name}
                              </div>
                            ))}
                          </div>
                         )}
                      </label>
                      <textarea 
                        value={manualDocumentText}
                        onChange={(event) => onManualDocumentTextChange(event.target.value)}
                        className="w-full min-h-[180px] bg-white/50 border border-hairline rounded-2xl p-4 focus:ring-4 focus:ring-[#D2B48C]/20 focus:border-[#D2B48C] outline-none text-xs placeholder:text-muted/30 resize-none transition-all shadow-inner"
                        placeholder="或者在此直接粘贴需要解析的文本内容..."
                      />
                    </div>
                    {documentError && (
                      <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-600">
                        {documentError}
                      </div>
                    )}
                    <div className="flex justify-center">
                      <button
                        onClick={onAnalyzeDocuments}
                        disabled={documentStatus === 'analyzing'}
                        className="px-12 py-3 bg-primary text-white rounded-2xl font-bold hover:bg-primary-active transition-all active:scale-95 flex items-center justify-center gap-2 text-sm shadow-xl shadow-primary/10 disabled:opacity-70"
                      >
                        <Sparkles size={16} className={documentStatus === 'analyzing' ? 'animate-pulse fill-white' : 'fill-white'} />
                        <span>{documentStatus === 'analyzing' ? '正在提取并解析...' : '开始解析'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="confirmation"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full flex justify-center"
            >
              <SearchConfirmationCard
                intent={searchIntent}
                status={searchStatus}
                error={searchError}
                output={searchOutput}
                onCancel={onResetSearch}
                onChange={onUpdateIntent}
                onRun={onRunSearch}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}


function SearchConfirmationCard({
  intent,
  status,
  error,
  output,
  onCancel,
  onChange,
  onRun
}: {
  intent: SearchIntent | null,
  status: 'idle' | 'mapping' | 'running',
  error: string,
  output: SearchRunOutput | null,
  onCancel: () => void,
  onChange: (intent: SearchIntent) => void,
  onRun: (intent: SearchIntent) => void
}) {
  if (!intent) {
    return (
      <div className="w-full max-w-4xl bg-white border border-hairline shadow-2xl rounded-3xl p-8 editorial-shadow">
        <p className="text-sm text-muted">还没有生成检索字段，请返回输入检索需求。</p>
      </div>
    );
  }

  const updateIntent = (updates: Partial<SearchIntent>) => {
    onChange({ ...intent, ...updates });
  };

  const updateDateRange = (key: 'start' | 'end', value: string) => {
    updateIntent({ dateRange: { ...intent.dateRange, [key]: value } });
  };

  const legalBasisText = intent.legalBasis.join('\n');

  return (
    <div className="w-full max-w-4xl bg-white border border-hairline shadow-2xl rounded-3xl overflow-hidden editorial-shadow flex flex-col max-h-[75vh]">
      <div className="px-8 py-6 border-b border-hairline bg-surface-soft flex justify-between items-start shrink-0">
        <div>
          <h2 className="text-xl font-bold text-ink underline decoration-primary/20 decoration-4 underline-offset-8">检索条件确认</h2>
          <p className="text-[12px] text-muted mt-3">AI 已为您自动解析检索字段，请核对并完善以下信息。修改后点击开始检索会打开真实检索页面。</p>
        </div>
        <button onClick={onCancel} className="p-2 hover:bg-hairline rounded-full text-muted transition-colors">
          <X size={18} />
        </button>
      </div>
      
      <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-4 overflow-y-auto no-scrollbar">
        <div className="col-span-full space-y-1.5">
          <label className="text-[9px] font-bold text-muted-soft uppercase tracking-[0.15em]">全文检索</label>
          <div className="relative">
            <input
              type="text"
              value={intent.fullTextQuery}
              onChange={(event) => updateIntent({ fullTextQuery: event.target.value })}
              className="w-full bg-canvas border border-hairline rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all"
            />
            <Sparkles size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-primary" />
          </div>
        </div>
        
        <div className="space-y-1.5">
          <label className="text-[9px] font-bold text-muted-soft uppercase tracking-[0.15em]">案件名称</label>
          <input
            type="text"
            value={intent.caseName}
            onChange={(event) => updateIntent({ caseName: event.target.value })}
            placeholder="请输入案件名称"
            className="w-full bg-white border border-hairline rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
          />
        </div>
        
        <div className="space-y-1.5">
          <label className="text-[9px] font-bold text-muted-soft uppercase tracking-[0.15em]">案由</label>
          <input
            type="text"
            value={intent.causeOfAction}
            onChange={(event) => updateIntent({ causeOfAction: event.target.value })}
            placeholder="如：教育行政管理"
            className="w-full bg-white border border-hairline rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[9px] font-bold text-muted-soft uppercase tracking-[0.15em]">案件类型</label>
          <select
            value={intent.caseType}
            onChange={(event) => updateIntent({ caseType: event.target.value as SearchIntent['caseType'] })}
            className="w-full bg-white border border-hairline rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
          >
            {['民事', '刑事', '行政', '执行', '国家赔偿', '未指定'].map(option => <option key={option}>{option}</option>)}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[9px] font-bold text-muted-soft uppercase tracking-[0.15em]">法院层级</label>
          <select
            value={intent.courtLevel}
            onChange={(event) => updateIntent({ courtLevel: event.target.value as SearchIntent['courtLevel'] })}
            className="w-full bg-white border border-hairline rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
          >
            {['未指定', '最高法院', '高级法院', '中级法院', '基层法院'].map(option => <option key={option}>{option}</option>)}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[9px] font-bold text-muted-soft uppercase tracking-[0.15em]">法院名称</label>
          <input
            type="text"
            value={intent.courtName}
            onChange={(event) => updateIntent({ courtName: event.target.value })}
            placeholder="可留空"
            className="w-full bg-white border border-hairline rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[9px] font-bold text-muted-soft uppercase tracking-[0.15em]">案号</label>
          <input
            type="text"
            value={intent.caseNo}
            onChange={(event) => updateIntent({ caseNo: event.target.value })}
            placeholder="可留空"
            className="w-full bg-white border border-hairline rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[9px] font-bold text-muted-soft uppercase tracking-[0.15em]">裁判日期起</label>
          <input
            type="date"
            value={intent.dateRange.start}
            onChange={(event) => updateDateRange('start', event.target.value)}
            className="w-full bg-white border border-hairline rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[9px] font-bold text-muted-soft uppercase tracking-[0.15em]">裁判日期止</label>
          <input
            type="date"
            value={intent.dateRange.end}
            onChange={(event) => updateDateRange('end', event.target.value)}
            className="w-full bg-white border border-hairline rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
          />
        </div>

        <div className="col-span-full space-y-1.5">
          <label className="text-[9px] font-bold text-muted-soft uppercase tracking-[0.15em]">法律依据</label>
          <textarea
            rows={2}
            value={legalBasisText}
            onChange={(event) => updateIntent({ legalBasis: event.target.value.split(/\n|,|，/).map(item => item.trim()).filter(Boolean) })}
            className="w-full bg-white border border-hairline rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none resize-none leading-relaxed"
          />
        </div>

        {intent.searchPlan.length > 0 && (
          <div className="col-span-full rounded-2xl bg-canvas border border-hairline px-5 py-4">
            <div className="text-[9px] font-bold text-muted-soft uppercase tracking-[0.15em] mb-2">检索计划</div>
            <ol className="space-y-1 text-xs text-muted list-decimal list-inside">
              {intent.searchPlan.map((item, index) => <li key={index}>{item}</li>)}
            </ol>
          </div>
        )}

        {intent.ambiguities.length > 0 && (
          <div className="col-span-full rounded-2xl bg-amber-50 border border-amber-100 px-5 py-4">
            <div className="text-[9px] font-bold text-amber-700 uppercase tracking-[0.15em] mb-2">需要留意</div>
            <div className="space-y-1 text-xs text-amber-800">
              {intent.ambiguities.map((item, index) => <p key={index}>{item}</p>)}
            </div>
          </div>
        )}

        {(error || output) && (
          <div className={`col-span-full rounded-2xl border px-5 py-4 ${output?.status === 'ok' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-700'}`}>
            {error && <p className="text-xs">{error}</p>}
            {output && (
              <div className="space-y-2 text-xs">
                <p className="font-bold">状态：{output.status === 'ok' ? '已完成' : output.status === 'needs_human' ? '需要人工处理' : '执行失败'}</p>
                {output.nextAction && <p>{output.nextAction}</p>}
                {output.resultUrl && <a className="inline-flex items-center gap-1 font-bold underline" href={output.resultUrl} target="_blank" rel="noreferrer">打开结果页 <ExternalLink size={12} /></a>}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-8 py-6 border-t border-hairline bg-surface-soft flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-muted-soft">
          <Info size={14} />
          <span className="text-[10px]">检索会调用本地浏览器自动化。若遇到登录或验证码，请在弹出的浏览器中手动处理。</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="px-6 py-2 border border-hairline bg-white rounded-xl text-muted hover:bg-canvas transition-colors font-medium text-xs">重置字段</button>
          <button
            onClick={() => onRun(intent)}
            disabled={status === 'running'}
            className="px-8 py-2 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary-active transition-all flex items-center gap-2 active:scale-95 text-xs disabled:opacity-70"
          >
            <Search size={14} className={status === 'running' ? 'animate-pulse' : ''} />
            <span>{status === 'running' ? '正在打开并填写网页...' : '开始检索'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}


function AnalysisView({ 
  caseData, 
  splitPosition, 
  startResizing, 
  splitRef,
  onAddToNote
}: { 
  caseData: CaseItem, 
  splitPosition: number, 
  startResizing: (e: React.MouseEvent) => void, 
  splitRef: React.RefObject<HTMLDivElement | null>,
  onAddToNote: (text: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [toolbarPos, setToolbarPos] = useState<{ x: number, y: number, text: string } | null>(null);
  const [highlights, setHighlights] = useState<{text: string, type: 'highlight' | 'underline'}[]>([]);

  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (!selection) return;
    
    const text = selection.toString().trim();
    if (text && text.length > 0 && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      
      // Ensure selection is within THIS AnalysisView container
      let isInside = false;
      if (containerRef.current) {
        isInside = containerRef.current.contains(range.commonAncestorContainer);
      }

      if (isInside) {
        const rect = range.getBoundingClientRect();
        const toolbarWidth = 180; 
        const margin = 20;
        let x = rect.left + rect.width / 2;
        
        // Clamp x to prevent overflow
        x = Math.max(toolbarWidth / 2 + margin, Math.min(x, window.innerWidth - toolbarWidth / 2 - margin));

        setToolbarPos({
          x,
          y: rect.top - 10,
          text
        });
      } else {
        setToolbarPos(null);
      }
    } else {
      setToolbarPos(null);
    }
  };

  const addHighlight = (type: 'highlight' | 'underline') => {
    if (toolbarPos) {
      setHighlights([...highlights, { text: toolbarPos.text, type }]);
      setToolbarPos(null);
    }
  };

  // Helper to render text with highlights
  const renderTextWithHighlights = (content: string) => {
    if (highlights.length === 0) return content;
    
    let rendered: any[] = [content];
    
    highlights.forEach((h, hIdx) => {
      const newRendered: any[] = [];
      rendered.forEach((part, pIdx) => {
        if (typeof part === 'string') {
          const index = part.indexOf(h.text);
          if (index !== -1) {
            newRendered.push(part.substring(0, index));
            newRendered.push(
              <span 
                key={`highlight-${hIdx}-${pIdx}`} 
                className={h.type === 'highlight' ? 'bg-primary/20' : 'border-b-[2px] border-primary border-dashed'}
                style={{ 
                  display: 'inline',
                  padding: '1px 0',
                  borderRadius: '2px',
                  verticalAlign: 'baseline',
                  margin: '0',
                  position: 'relative',
                  bottom: '0.1em'
                }}
              >
                {h.text}
              </span>
            );
            newRendered.push(part.substring(index + h.text.length));
          } else {
            newRendered.push(part);
          }
        } else {
          newRendered.push(part);
        }
      });
      rendered = newRendered;
    });

    return rendered;
  };

  const originalParagraphs = (caseData.originalText || '').split(/\n{2,}|\r?\n/).map(p => p.trim()).filter(Boolean);
  const metaEntries = Object.entries(caseData.analysisMeta || {}).filter(([, value]) => value);
  const reportText = caseData.analysisReport || '';

  return (
    <div ref={containerRef} className="h-full flex flex-col" onMouseUp={handleMouseUp}>
       {/* Selection Toolbar */}
       <AnimatePresence>
         {toolbarPos && (
           <motion.div 
             initial={{ opacity: 0, y: 10, scale: 0.9 }}
             animate={{ opacity: 1, y: 0, scale: 1 }}
             exit={{ opacity: 0, y: 10, scale: 0.9 }}
             style={{ 
               position: 'fixed', 
               left: toolbarPos.x, 
               top: toolbarPos.y, 
               transform: 'translate(-50%, -100%)' 
             }}
             className="flex items-center gap-1 p-1 bg-ink text-white rounded-xl shadow-2xl z-[100] border border-white/10"
           >
              <button 
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addHighlight('highlight')}
                className="p-2 hover:bg-white/20 rounded-lg flex flex-col items-center gap-1 min-w-[50px] transition-colors"
              >
                <Highlighter size={16} />
                <span className="text-[10px] font-bold">高亮</span>
              </button>
              <button 
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addHighlight('underline')}
                className="p-2 hover:bg-white/20 rounded-lg flex flex-col items-center gap-1 min-w-[50px] transition-colors"
              >
                <Underline size={16} />
                <span className="text-[10px] font-bold">下划线</span>
              </button>
              <div className="w-px h-8 bg-white/20 mx-1" />
              <button 
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onAddToNote(toolbarPos.text);
                  setToolbarPos(null);
                }}
                className="p-2 hover:bg-white/20 rounded-lg flex flex-col items-center gap-1 min-w-[50px] transition-colors"
              >
                <PlusCircle size={16} />
                <span className="text-[10px] font-bold">记笔记</span>
              </button>
           </motion.div>
         )}
       </AnimatePresence>

       <div className="bg-white border-b border-hairline px-6 py-3 flex justify-between items-center z-20 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-primary/5 rounded-lg flex items-center justify-center border border-primary/10">
               <FileText className="text-primary w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-ink">{caseData.name}.pdf</h2>
              </div>
            </div>
          </div>
          <div className="flex gap-1 items-center">
            <div className="w-px h-6 bg-hairline mx-2" />
          </div>
       </div>

       <div ref={splitRef} className="flex-1 flex overflow-hidden relative">
          {/* Left Pane: Original Text */}
          <div style={{ width: `${splitPosition}%` }} className="h-full overflow-y-auto px-12 py-12 bg-white shrink-0 scroll-smooth">
             <article className="max-w-3xl mx-auto space-y-6 text-ink leading-relaxed font-serif text-lg">
                {originalParagraphs.length > 0 ? (
                  originalParagraphs.map((paragraph, index) => (
                    <p key={index} className={index === 0 ? 'text-center font-bold text-2xl mb-8' : 'text-justify indent-8'}>
                      {renderTextWithHighlights(paragraph)}
                    </p>
                  ))
                ) : (
                  <>
                    <p className="text-center font-bold text-2xl mb-8">民事裁定书</p>
                    <p className="text-justify indent-8">{renderTextWithHighlights('原告XXX科技有限公司与被告YYY网络技术有限公司计算机软件著作权许可使用合同纠纷一案。')}</p>
                  </>
                )}
             </article>
          </div>

          {/* Resizer Handle */}
          <div 
            onMouseDown={startResizing}
            className="w-1.5 h-full bg-hairline hover:bg-primary/30 transition-colors cursor-col-resize relative z-30 flex items-center justify-center shrink-0"
          >
          </div>

          {/* Right Pane: AI Analysis */}
          <div style={{ width: `${100 - splitPosition}%` }} className="h-full flex overflow-hidden bg-surface-soft/40 shrink-0 border-l border-hairline">
             {/* Analysis Content */}
             <div className="flex-1 overflow-y-auto px-6 py-8 no-scrollbar">
                <div className="space-y-6 max-w-3xl mx-auto">
                    <section className="bg-white rounded-2xl border border-hairline p-6 shadow-sm">
                      <div className="flex items-center gap-3 mb-6">
                          <Info className="text-primary w-5 h-5" />
                          <h3 className="text-lg font-bold text-ink">基础信息</h3>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {metaEntries.map(([label, value]) => (
                          <div key={label} className="border-b border-hairline pb-3 min-w-0">
                            <p className="text-[10px] text-muted-soft font-bold mb-1">{label}</p>
                            <MetaValue label={label} value={String(value)} />
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="bg-white rounded-2xl border border-hairline p-6 shadow-sm">
                      <div className="flex items-center gap-3 mb-6">
                          <Sparkles className="text-primary w-5 h-5" />
                          <h3 className="text-lg font-bold text-ink">结构化分析报告</h3>
                      </div>
                      <AnalysisReport text={reportText} />
                    </section>

                    <section className="bg-white rounded-2xl border border-hairline p-6 shadow-sm overflow-hidden relative border-primary/20">
                      <div className="absolute top-0 right-0 p-4 opacity-[0.03] pointer-events-none">
                         <Gavel size={100} />
                      </div>
                      <div className="flex items-center gap-3 mb-6">
                          <Gavel className="text-primary w-5 h-5" />
                          <h3 className="text-lg font-bold text-ink">我的笔记</h3>
                      </div>
                      <div className="bg-surface-cream-strong/30 p-5 rounded-xl border border-hairline/60">
                         <p className="text-[12px] text-muted-soft leading-relaxed">可在右侧笔记面板继续记录课堂讨论、法考考点或论文引用价值。</p>
                      </div>
                    </section>
                </div>
             </div>
          </div>
       </div>
    </div>
  );
}

function renderInlineMarkdown(text: string) {
  const withColonBold = text.replace(
    /(^|[。；;]\s*)([^：:。；;\n]{2,24}[：:])/g,
    (match, prefix, label) => `${prefix}**${label}**`
  );
  const parts = withColonBold.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-bold text-ink">{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function splitLeadingColonLabel(text: string) {
  const normalized = text.trim();
  const match = normalized.match(/^\*{0,2}([^：:。；;\n]{2,28}[：:])\*{0,2}\s*(.+)$/);
  if (!match) return null;
  return { label: match[1], body: match[2].trim() };
}

function ReportText({ text, className = '' }: { text: string, className?: string }) {
  const split = splitLeadingColonLabel(text);
  if (!split) {
    return <p className={className}>{renderInlineMarkdown(text)}</p>;
  }

  return (
    <div className={className}>
      <p><strong className="font-bold text-ink">{split.label}</strong></p>
      <p className="mt-1">{renderInlineMarkdown(split.body)}</p>
    </div>
  );
}

function AnalysisReport({ text }: { text: string }) {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return <p className="text-sm text-muted">暂无结构化分析报告。</p>;
  }

  return (
    <div className="space-y-3 text-[13px] leading-relaxed">
      {lines.map((line, index) => {
        const titleWithRest = line.match(/^\*\*((?:案件结构化分析报告|[一二三四五六七]、[^*]+))\*\*\s*(.*)$/);
        if (titleWithRest) {
          const [, title, rest] = titleWithRest;
          if (title === '案件结构化分析报告') {
            return rest ? (
              <React.Fragment key={index}>
                <ReportText text={rest} className="text-sm text-muted leading-7 whitespace-pre-wrap" />
              </React.Fragment>
            ) : null;
          }
          return (
            <div key={index} className={index === 0 ? 'pt-0' : 'pt-2'}>
              <h4 className="text-base font-bold text-ink border-l-4 border-primary pl-3 bg-surface-soft/40 py-2 rounded-r-lg">{title}</h4>
              {rest && <ReportText text={rest} className="mt-2 text-sm text-muted leading-7" />}
            </div>
          );
        }

        if (/^\d+[.、]/.test(line) || /^[-•]/.test(line)) {
          return (
            <div key={index} className="flex gap-2 pl-4 text-sm text-muted leading-7">
              <span className="mt-[0.65em] h-1.5 w-1.5 rounded-full bg-primary/70 shrink-0" />
              <ReportText text={line.replace(/^[-•]\s*/, '')} />
            </div>
          );
        }

        return (
          <React.Fragment key={index}>
            <ReportText text={line} className="text-sm text-muted leading-7 whitespace-pre-wrap" />
          </React.Fragment>
        );
      })}
    </div>
  );
}

function MetaValue({ label, value }: { label: string, value: string }) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const shouldSplit = /当事人|律师|律所|审判人员|法律依据/.test(label);
  const lines = shouldSplit
    ? normalized
      .replace(/(原告|被告|上诉人|被上诉人|申请人|被申请人|原审被告|原审原告|第三人|审判长|审判员|书记员|委托诉讼代理人)([（(：:])/g, '\n$1$2')
      .replace(/；/g, '\n')
      .replace(/、《/g, '\n《')
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean)
    : [normalized];

  return (
    <div className="space-y-1.5 text-xs text-ink leading-6 break-words">
      {lines.map((line, index) => {
        const role = line.match(/^([^：:]{2,18})[：:](.*)$/);
        return (
          <p key={index}>
            {role ? (
              <>
                <strong className="font-bold text-primary">{role[1]}：</strong>
                <span>{role[2].trim()}</span>
              </>
            ) : (
              <span>{line}</span>
            )}
          </p>
        );
      })}
    </div>
  );
}

function ComparisonView({ 
  selectedCaseIds: initialSelectedCaseIds, 
  onSelectCase: onParentSelectCase,
  allCases,
  groups
}: { 
  selectedCaseIds: string[], 
  onSelectCase: (id: string) => void,
  allCases: CaseItem[],
  groups: { id: string, name: string, cases: string[] }[]
}) {
  const [showSelector, setShowSelector] = useState(false);
  const [tempSelected, setTempSelected] = useState<string[]>(initialSelectedCaseIds);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeCaseIds, setActiveCaseIds] = useState<string[]>(initialSelectedCaseIds);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(groups.map(g => g.id));

  const toggleGroupExpand = (id: string) => {
    setExpandedGroups(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleTempSelect = (id: string) => {
    if (tempSelected.includes(id)) {
      setTempSelected(tempSelected.filter(i => i !== id));
    } else if (tempSelected.length < 5) {
      setTempSelected([...tempSelected, id]);
    }
  };

  const confirmSelection = () => {
    if (tempSelected.length >= 2) {
      setIsAnalyzing(true);
      setShowSelector(false);
      // Simulate analysis
      setTimeout(() => {
        setActiveCaseIds(tempSelected);
        setIsAnalyzing(false);
      }, 1500);
    }
  };

  const copyTableToClipboard = () => {
    const tableHeader = ['维度', ...activeCaseIds.map(id => allCases.find(c => c.id === id)?.name || '未选')].join('\t');
    const tableRows = tableData.map(row => {
      const vals = activeCaseIds.map((_, i) => row.vals ? row.vals[i] : '');
      return [row.label, ...vals].join('\t');
    }).join('\n');
    
    const fullText = tableHeader + '\n' + tableRows;
    navigator.clipboard.writeText(fullText);
    alert('表格内容已复制到剪贴板');
  };

  const tableData = [
    { label: '案件类型', vals: ['民事一审', '劳动仲裁/一审', '商事仲裁', '', ''] },
    { label: '案由', vals: ['民间借贷纠纷', '劳动合同纠纷', '建筑工程纠纷', '', ''] },
    { label: '法院层级', vals: ['基层人民法院', '中级人民法院', '某仲裁委员会', '', ''] },
    { label: '裁判时间', vals: ['2023-05-12', '2022-11-28', '2024-01-15', '', ''] },
    { label: '基本事实', vals: ['借款50万元未还', '末位淘汰解除合同', '变更图纸导致延误', '', ''] },
    { label: '争议焦点', vals: ['借贷关系是否成立', '解除行为合法性', '违约金计算基数', '', ''] },
    { label: '适用法律', vals: ['《民法典》借款合同章', '《劳动合同法》第48条', '《民法典》合同编', '', ''] },
    { label: '裁判理由', vals: ['借条真实效力认定', '不符合解除条件', '依约承担违约责任', '', ''] },
    { label: '裁判结果', vals: ['支持原告诉求', '支付赔偿金', '部分支持索赔', '', ''] },
    { label: '相同点', vals: ['均涉及商事契约真实性', '均涉及商事契约真实性', '均涉及商事契约真实性', '', ''] },
    { label: '差异点', vals: ['标的物为现金', '标的物为劳务', '标的物为工程', '', ''] },
  ];

  return (
    <div className="h-full w-full overflow-hidden flex flex-col p-6 bg-canvas relative">
      <div className="w-full max-w-full mx-auto flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex justify-between items-end mb-6 gap-4 shrink-0 px-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold font-serif text-ink tracking-tight">案例对比</h1>
            <p className="text-muted text-sm font-medium">当前已提取 <span className="text-primary font-bold">{activeCaseIds.length} 篇</span> 文书核心字段进行结构化深度分析</p>
          </div>
          <div className="flex gap-3">
             <button 
              onClick={() => setShowSelector(true)}
              className="bg-white border border-hairline text-primary px-6 py-2 rounded-xl text-sm font-bold hover:bg-canvas transition-all flex items-center gap-2 shadow-sm"
             >
                <Plus size={16} />
                <span>选择对比案例</span>
             </button>
             <button 
                onClick={copyTableToClipboard}
                className="bg-primary text-white px-8 py-2 rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary-active transition-all flex items-center gap-2 active:scale-95"
             >
                <Copy size={16} />
                <span>复制表格</span>
             </button>
          </div>
        </div>

        <div className="flex-1 bg-white rounded-3xl border border-hairline shadow-xl overflow-hidden editorial-shadow flex flex-col">
           <div className="flex-1 overflow-auto no-scrollbar">
              <table className="w-full border-collapse table-fixed">
                <thead className="sticky top-0 z-10 shrink-0">
                  <tr className="bg-surface-soft border-b border-hairline">
                    <th className="px-6 py-6 text-left font-serif text-2xl text-primary w-[140px] bg-surface-soft">维度</th>
                    {Array.from({ length: Math.max(activeCaseIds.length, 3) }).map((_, i) => {
                       const caseId = activeCaseIds[i];
                       const c = allCases.find(cas => cas.id === caseId);
                       return (
                        <th key={i} className="px-6 py-6 text-left font-serif text-lg border-l border-hairline-soft text-ink">
                          {c ? c.name : <span className="text-muted-soft opacity-40">未选择案例</span>}
                        </th>
                       )
                    })}
                  </tr>
                </thead>
                <tbody className="font-sans">
                  {tableData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-surface-soft/20 transition-colors border-b border-hairline-soft last:border-b-0">
                      <td className="px-6 py-4 font-bold text-sm text-muted-soft bg-surface-soft/10 leading-tight">{row.label}</td>
                      {Array.from({ length: Math.max(activeCaseIds.length, 3) }).map((_, i) => (
                        <td key={i} className="px-6 py-4 text-[13px] font-medium text-ink border-l border-hairline-soft leading-relaxed break-words">
                          {activeCaseIds[i] ? row.vals[i] : ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {isAnalyzing && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center z-40">
                    <div className="relative w-24 h-24 mb-6">
                        <Sparkles className="text-primary w-24 h-24 animate-pulse" />
                        <div className="absolute inset-0 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                    </div>
                    <p className="text-lg font-bold text-primary italic font-serif">AI 正在深度比对案例细节...</p>
                </div>
              )}
           </div>
        </div>
      </div>

      <AnimatePresence>
        {showSelector && (
          <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl editorial-shadow"
            >
               <div className="px-8 py-6 border-b border-hairline flex justify-between items-center">
                  <div>
                    <h3 className="text-xl font-bold text-ink">选择对比案例</h3>
                    <p className="text-xs text-muted">请选择 2-5 个案例进行结构化比对</p>
                  </div>
                  <button onClick={() => setShowSelector(false)} className="p-2 hover:bg-surface-soft rounded-full text-muted">
                    <X size={20} />
                  </button>
               </div>
               
               <div className="p-8 space-y-6 max-h-[500px] overflow-y-auto no-scrollbar">
                  {groups.map(group => (
                    <div key={group.id} className="space-y-4">
                       <button 
                         onClick={() => toggleGroupExpand(group.id)}
                         className="w-full flex items-center justify-between px-4 py-2 bg-surface-soft/50 rounded-xl hover:bg-surface-soft transition-all"
                       >
                          <div className="flex items-center gap-2">
                             <FolderOpen size={16} className="text-primary" />
                             <span className="text-sm font-bold text-ink">{group.name}</span>
                             <span className="text-[10px] text-muted-soft bg-white px-1.5 py-0.5 rounded-md border border-hairline">{group.cases.length} 篇</span>
                          </div>
                          {expandedGroups.includes(group.id) ? <ChevronDown size={16} className="text-muted-soft" /> : <ChevronRight size={16} className="text-muted-soft" />}
                       </button>

                       {expandedGroups.includes(group.id) && (
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 ml-2">
                            {group.cases.map(caseId => {
                              const c = allCases.find(cas => cas.id === caseId);
                              if (!c) return null;
                              return (
                                <button 
                                  key={c.id}
                                  onClick={() => toggleTempSelect(c.id)}
                                  className={`p-4 rounded-2xl border text-left transition-all relative ${
                                    tempSelected.includes(c.id) 
                                      ? 'bg-primary/5 border-primary shadow-sm' 
                                      : 'bg-white border-hairline hover:border-primary/20'
                                  }`}
                                >
                                  <div className="flex items-center justify-between mb-2">
                                      <FileText size={16} className={tempSelected.includes(c.id) ? 'text-primary' : 'text-muted-soft'} />
                                      {tempSelected.includes(c.id) && <CheckCircle2 size={16} className="text-primary" />}
                                  </div>
                                  <p className={`text-sm font-bold ${tempSelected.includes(c.id) ? 'text-primary' : 'text-ink'}`}>{c.name}</p>
                                  <p className="text-[10px] text-muted-soft uppercase tracking-wider mt-1">{c.cause}</p>
                                </button>
                              );
                            })}
                         </div>
                       )}
                    </div>
                  ))}
               </div>

               <div className="px-8 py-6 bg-surface-soft border-t border-hairline flex justify-between items-center">
                  <span className="text-sm font-medium text-muted">已选择 <span className="text-primary font-bold">{tempSelected.length}</span> / 5</span>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setShowSelector(false)}
                      className="px-6 py-2 bg-white border border-hairline text-muted rounded-xl text-sm font-bold"
                    >
                      取消
                    </button>
                    <button 
                      disabled={tempSelected.length < 2}
                      onClick={confirmSelection}
                      className={`px-8 py-2 rounded-xl text-sm font-bold transition-all shadow-lg ${
                        tempSelected.length >= 2 
                          ? 'bg-primary text-white shadow-primary/20 hover:bg-primary-active' 
                          : 'bg-hairline text-muted-soft cursor-not-allowed'
                      }`}
                    >
                      确认分析
                    </button>
                  </div>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

