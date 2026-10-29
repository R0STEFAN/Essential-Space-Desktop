import { useState, useEffect, useCallback, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import Navbar from '@/components/Navbar';
import FilterBar, { type TagCount } from '@/components/FilterBar';
import FloatingFilterDock from '@/components/FloatingFilterDock';
import CardGrid from '@/components/CardGrid';
import ForYouTab from '@/components/ForYouTab';
import CardDetailModal from '@/components/CardDetailModal';
import CreateNoteModal from '@/components/CreateNoteModal';
import CollectionModal from '@/components/CollectionModal';
import BulkActionBar from '@/components/BulkActionBar';
import SelectCollectionModal from '@/components/SelectCollectionModal';
import QuickCaptureModal from '@/components/QuickCaptureModal';
import SettingsModal from '@/components/SettingsModal';
import LoginView from '@/components/LoginView';
import UpdateBanner from '@/components/UpdateBanner';
import { checkForUpdates, CURRENT_APP_VERSION, type UpdateInfo } from '@/lib/updater';
import {
  getDbCards,
  getDbCollections,
  getDbAuth,
  clearDbAuth,
  updateDbCard,
  deleteDbCard,
} from '@/lib/db';
import { syncNothingCloud } from '@/lib/sync-engine';
import {
  updateCloudCard,
  bulkDeleteCloudCards,
  bulkRestoreCloudCards,
  bulkHardDeleteCloudCards,
  bulkAssignCollectionCloudCards,
  setCardTrashState,
} from '@/lib/nothing-cards';
import {
  setupGlobalShortcut,
  cleanupGlobalShortcuts,
  getStoredShortcut,
  isTauri,
} from '@/lib/shortcuts';
import type { Card, Collection, NothingUser } from '@/types';

export default function App() {
  const [currentUser, setCurrentUser] = useState<NothingUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Main Dashboard states
  const [activeTab, setActiveTab] = useState<'foryou' | 'library'>('foryou');
  const [allDbCards, setAllDbCards] = useState<Card[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeType, setActiveType] = useState('');
  const [activeCollection, setActiveCollection] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isTrash, setIsTrash] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);

  // Modals state
  const [modalCard, setModalCard] = useState<Card | null>(null);
  const [isCreateNoteOpen, setIsCreateNoteOpen] = useState(false);
  const [isQuickCaptureOpen, setIsQuickCaptureOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [collectionModalState, setCollectionModalState] = useState<{
    isOpen: boolean;
    mode: 'CREATE' | 'EDIT';
    collection?: Collection | null;
  }>({ isOpen: false, mode: 'CREATE' });

  // Multi-select & Bulk state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [isSelectCollectionModalOpen, setIsSelectCollectionModalOpen] = useState(false);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // GitHub Releases update tracking
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isUpdateDismissed, setIsUpdateDismissed] = useState(false);

  useEffect(() => {
    checkForUpdates(CURRENT_APP_VERSION)
      .then(info => {
        if (info.hasUpdate) {
          setUpdateInfo(info);
        }
      })
      .catch(err => console.warn('Silent update check failed:', err));
  }, []);

  // Load auth state from IndexedDB
  const checkAuth = useCallback(async () => {
    try {
      const auth = await getDbAuth();
      if (auth && auth.token) {
        setCurrentUser(auth);
      } else {
        setCurrentUser(null);
      }
    } catch (err) {
      console.error('Failed to get auth from db:', err);
      setCurrentUser(null);
    } finally {
      setIsAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Load local cards & collections
  const loadData = useCallback(async () => {
    if (!currentUser) return;
    try {
      const dbCards = await getDbCards();
      const dbCollections = await getDbCollections();
      setAllDbCards(dbCards);
      setCollections(dbCollections);
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load local data:', err);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      loadData();
    }
  }, [currentUser, loadData]);

  // Global Quick Capture shortcut registration
  useEffect(() => {
    const bindShortcut = async () => {
      const shortcut = getStoredShortcut();
      await setupGlobalShortcut(shortcut, () => {
        setIsQuickCaptureOpen(true);
      });
    };

    bindShortcut();

    return () => {
      cleanupGlobalShortcuts();
    };
  }, []);

  // Listen to Tray event `open-quick-capture` from Tauri backend
  useEffect(() => {
    if (!isTauri()) return;

    let unlistenFn: (() => void) | undefined;
    listen('open-quick-capture', () => {
      setIsQuickCaptureOpen(true);
    }).then(u => {
      unlistenFn = u;
    });

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  // Sync handler
  const handleSync = async () => {
    if (!currentUser || isSyncing) return;
    setIsSyncing(true);
    setSyncError(null);
    setSyncSuccess(null);

    try {
      const result = await syncNothingCloud(currentUser);
      if (result.success) {
        setSyncSuccess(`Synced ${result.cardsCount} cards successfully.`);
        await loadData();
        setTimeout(() => setSyncSuccess(null), 3500);
      } else {
        setSyncError(result.error || 'Sync failed');
      }
    } catch (err: any) {
      setSyncError(err?.message || 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogout = async () => {
    await clearDbAuth();
    setCurrentUser(null);
    setAllDbCards([]);
    setCollections([]);
  };

  // Card-Collection matcher
  const cardMatchesCollection = useCallback((card: Card, col: Collection) => {
    if (card.collectionIds && card.collectionIds.includes(col.collectionId)) return true;
    if (card.collectionId && card.collectionId === col.collectionId) return true;
    if (col.name && Array.isArray(card.tags)) {
      const colNameLower = col.name.trim().toLowerCase();
      return card.tags.some(t => String(t).trim().toLowerCase() === colNameLower);
    }
    return false;
  }, []);

  // Filtered cards list
  const filteredCards = useMemo(() => {
    let result = allDbCards.filter(c => (isTrash ? c.targetState === 1 : c.targetState === 0));

    if (collections.length > 0) {
      const collMap = new Map(collections.map(col => [col.collectionId, col.name]));
      result = result.map(c => {
        const colNames = c.collectionIds
          ? c.collectionIds.map(id => collMap.get(id)).filter((n): n is string => Boolean(n))
          : [];
        return {
          ...c,
          collectionNames: colNames.length > 0 ? colNames : (c.collectionNames || []),
          collectionName:
            colNames.length > 0
              ? colNames.join(', ')
              : (c.collectionId ? collMap.get(c.collectionId) : c.collectionName),
        };
      });
    }

    if (activeCollection) {
      const selectedCol = collections.find(col => col.collectionId === activeCollection);
      result = result.filter(c =>
        selectedCol ? cardMatchesCollection(c, selectedCol) : c.collectionId === activeCollection
      );
    }

    if (activeType) {
      result = result.filter(c => c.type.toUpperCase() === activeType.toUpperCase());
    }

    if (activeTag) {
      result = result.filter(c => Array.isArray(c.tags) && c.tags.includes(activeTag));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        c =>
          c.title?.toLowerCase().includes(q) ||
          c.content?.toLowerCase().includes(q) ||
          c.summary?.toLowerCase().includes(q) ||
          (Array.isArray(c.tags) && c.tags.some(t => t.toLowerCase().includes(q))) ||
          c.link?.url?.toLowerCase().includes(q) ||
          c.link?.title?.toLowerCase().includes(q) ||
          c.audio?.transcript?.toLowerCase().includes(q)
      );
    }

    return result.sort((a, b) => b.createTime - a.createTime);
  }, [allDbCards, isTrash, collections, activeCollection, activeType, activeTag, searchQuery, cardMatchesCollection]);

  // Compute collection counts
  const collectionsWithCounts = useMemo(() => {
    const activeCards = allDbCards.filter(c => c.targetState === 0);
    return collections.map(col => {
      const count = activeCards.filter(c => cardMatchesCollection(c, col)).length;
      return { ...col, cardCount: count };
    });
  }, [collections, allDbCards, cardMatchesCollection]);

  // Tag counts
  const availableTags: TagCount[] = useMemo(() => {
    const activeCards = allDbCards.filter(c => (isTrash ? c.targetState === 1 : c.targetState === 0));
    const tagMap = new Map<string, number>();

    for (const card of activeCards) {
      if (Array.isArray(card.tags)) {
        for (const tag of card.tags) {
          const clean = tag.trim();
          if (clean) {
            tagMap.set(clean, (tagMap.get(clean) || 0) + 1);
          }
        }
      }
    }

    return Array.from(tagMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [allDbCards, isTrash]);

  // Toggle todo checklist item
  const handleToggleTodo = async (cardId: string, eventId: string) => {
    const targetCard = allDbCards.find(c => c.cardId === cardId);
    if (!targetCard || !targetCard.events || !currentUser) return;

    const updatedEvents = targetCard.events.map(ev => {
      if (ev.eventId === eventId) {
        return { ...ev, check: ev.check === 1 ? 0 : 1 };
      }
      return ev;
    });

    const updatedCard: Card = {
      ...targetCard,
      events: updatedEvents,
      updateTime: Date.now(),
    };

    setAllDbCards(prev => prev.map(c => (c.cardId === cardId ? updatedCard : c)));
    await updateDbCard(cardId, updatedCard);
    await updateCloudCard(currentUser.token, updatedCard).catch(err => {
      console.warn('Background card update sync failed:', err);
    });
  };

  // Single card restore
  const handleRestoreSingleCard = async (cardId: string) => {
    const targetCard = allDbCards.find(c => c.cardId === cardId);
    if (!targetCard || !currentUser) return;

    const res = await setCardTrashState(currentUser.token, targetCard, false);
    if (res.success) {
      setAllDbCards(prev =>
        prev.map(c => (c.cardId === cardId ? { ...c, targetState: 0, updateTime: Date.now() } : c))
      );
      if (modalCard?.cardId === cardId) {
        setModalCard(null);
      }
    }
  };

  // Single card permanent delete
  const handleDeleteSingleCard = async (cardId: string) => {
    if (!currentUser) return;
    const res = await bulkHardDeleteCloudCards(currentUser.token, [cardId]);
    if (res.success) {
      await deleteDbCard(cardId);
      setAllDbCards(prev => prev.filter(c => c.cardId !== cardId));
      if (modalCard?.cardId === cardId) {
        setModalCard(null);
      }
    }
  };

  // Bulk actions
  const handleToggleSelectCard = (cardId: string) => {
    setSelectedCardIds(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedCardIds.size === filteredCards.length) {
      setSelectedCardIds(new Set());
    } else {
      setSelectedCardIds(new Set(filteredCards.map(c => c.cardId)));
    }
  };

  const handleClearSelection = () => {
    setIsSelectMode(false);
    setSelectedCardIds(new Set());
  };

  const handleBulkMoveToTrash = async () => {
    if (!currentUser || selectedCardIds.size === 0) return;
    setIsBulkProcessing(true);
    const ids = Array.from(selectedCardIds);
    try {
      await bulkDeleteCloudCards(currentUser.token, ids);
      const now = Date.now();
      for (const id of ids) {
        await updateDbCard(id, { targetState: 1, updateTime: now });
      }
      setAllDbCards(prev =>
        prev.map(c => (selectedCardIds.has(c.cardId) ? { ...c, targetState: 1, updateTime: now } : c))
      );
      setSelectedCardIds(new Set());
      setIsSelectMode(false);
    } catch (err: any) {
      setSyncError(err?.message || 'Bulk delete failed');
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkRestore = async () => {
    if (!currentUser || selectedCardIds.size === 0) return;
    setIsBulkProcessing(true);
    const ids = Array.from(selectedCardIds);
    try {
      await bulkRestoreCloudCards(currentUser.token, ids);
      const now = Date.now();
      for (const id of ids) {
        await updateDbCard(id, { targetState: 0, updateTime: now });
      }
      setAllDbCards(prev =>
        prev.map(c => (selectedCardIds.has(c.cardId) ? { ...c, targetState: 0, updateTime: now } : c))
      );
      setSelectedCardIds(new Set());
      setIsSelectMode(false);
    } catch (err: any) {
      setSyncError(err?.message || 'Bulk restore failed');
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkHardDelete = async () => {
    if (!currentUser || selectedCardIds.size === 0) return;
    if (!confirm(`Permanently delete ${selectedCardIds.size} cards? This action cannot be undone.`)) return;
    setIsBulkProcessing(true);
    const ids = Array.from(selectedCardIds);
    try {
      await bulkHardDeleteCloudCards(currentUser.token, ids);
      for (const id of ids) {
        await deleteDbCard(id);
      }
      setAllDbCards(prev => prev.filter(c => !selectedCardIds.has(c.cardId)));
      setSelectedCardIds(new Set());
      setIsSelectMode(false);
    } catch (err: any) {
      setSyncError(err?.message || 'Permanent delete failed');
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkAssignCollection = async (
    collectionIds: string[],
    collectionNames?: string[]
  ) => {
    if (!currentUser || selectedCardIds.size === 0) return;
    setIsBulkProcessing(true);
    const ids = Array.from(selectedCardIds);
    const joinedNames =
      collectionNames && collectionNames.length > 0 ? collectionNames.join(', ') : undefined;
    try {
      const now = Date.now();
      setAllDbCards(prev =>
        prev.map(c => {
          if (selectedCardIds.has(c.cardId)) {
            return {
              ...c,
              collectionIds,
              collectionId: collectionIds[0] || undefined,
              collectionNames,
              collectionName: joinedNames,
              updateTime: now,
            };
          }
          return c;
        })
      );
      for (const id of ids) {
        await updateDbCard(id, {
          collectionIds,
          collectionId: collectionIds[0] || undefined,
          collectionNames,
          collectionName: joinedNames,
          updateTime: now,
        });
      }
      const targetCards = allDbCards.filter(c => selectedCardIds.has(c.cardId));
      await bulkAssignCollectionCloudCards(currentUser.token, targetCards, collectionIds);
      setSelectedCardIds(new Set());
      setIsSelectMode(false);
      setIsSelectCollectionModalOpen(false);
    } catch (err: any) {
      setSyncError(err?.message || 'Failed to assign collection');
    } finally {
      setIsBulkProcessing(false);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-nothing-border border-t-nothing-red animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginView
        onLoginSuccess={user => {
          setCurrentUser(user);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-black text-[#E6E6E6] flex flex-col font-mono selection:bg-nothing-red selection:text-white pb-24">
      {/* Optional Update Banner */}
      {updateInfo && !isUpdateDismissed && (
        <UpdateBanner
          updateInfo={updateInfo}
          onDismiss={() => setIsUpdateDismissed(true)}
        />
      )}

      {/* Top Navigation */}
      <Navbar
        userEmail={currentUser.email}
        isSyncing={isSyncing}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onSync={handleSync}
        onLogout={handleLogout}
        onOpenCreateNote={() => setIsQuickCaptureOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
        {syncSuccess && (
          <div className="p-3 rounded-xl bg-green-950/80 border border-green-800 text-xs font-mono text-green-200">
            {syncSuccess}
          </div>
        )}
        {syncError && (
          <div className="p-3 rounded-xl bg-red-950/80 border border-red-800 text-xs font-mono text-red-200">
            {syncError}
          </div>
        )}

        {activeTab === 'foryou' ? (
          <ForYouTab
            cards={allDbCards}
            collections={collections}
            onToggleTodo={handleToggleTodo}
            onRefreshData={loadData}
            onOpenCardDetail={card => setModalCard(card)}
            onNavigateToCollection={colId => {
              setActiveCollection(colId);
              setActiveTab('library');
            }}
            token={currentUser.token}
            userId={currentUser.uuid}
          />
        ) : (
          <div className="flex flex-col gap-6">
            <FilterBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              collections={collectionsWithCounts}
              activeCollection={activeCollection}
              onSelectCollection={setActiveCollection}
              tags={availableTags}
              activeTag={activeTag}
              onSelectTag={setActiveTag}
              onOpenCreateCollection={() =>
                setCollectionModalState({ isOpen: true, mode: 'CREATE' })
              }
              onOpenEditCollection={col =>
                setCollectionModalState({ isOpen: true, mode: 'EDIT', collection: col })
              }
            />

            <CardGrid
              cards={filteredCards}
              isLoading={isLoading}
              onToggleTodo={handleToggleTodo}
              activeTag={activeTag}
              onSelectTag={setActiveTag}
              isSelectMode={isSelectMode}
              selectedCardIds={selectedCardIds}
              onToggleSelect={handleToggleSelectCard}
              onRestoreCard={handleRestoreSingleCard}
              onDeleteCard={handleDeleteSingleCard}
              collections={collections}
              token={currentUser.token}
              userId={currentUser.uuid}
              onCardUpdated={updatedCard => {
                setAllDbCards(prev =>
                  prev.map(c => (c.cardId === updatedCard.cardId ? updatedCard : c))
                );
              }}
              onOpenCreateCollection={() =>
                setCollectionModalState({ isOpen: true, mode: 'CREATE' })
              }
              onCollectionCreated={savedCol => {
                setCollections(prev => [...prev, savedCol]);
              }}
            />
          </div>
        )}
      </main>

      {/* Floating Bottom Filter Dock (Library Tab) */}
      {activeTab === 'library' && !isSelectMode && (
        <FloatingFilterDock
          activeType={activeType}
          isTrash={isTrash}
          onSelectType={setActiveType}
          onToggleTrash={() => {
            setIsTrash(prev => !prev);
            setSelectedCardIds(new Set());
          }}
        />
      )}

      {/* Floating Multi-select Action Bar */}
      {isSelectMode && (
        <BulkActionBar
          selectedCount={selectedCardIds.size}
          totalCount={filteredCards.length}
          isAllSelected={selectedCardIds.size === filteredCards.length && filteredCards.length > 0}
          isTrash={isTrash}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          onOpenAssignCollection={() => setIsSelectCollectionModalOpen(true)}
          onDeleteSelected={isTrash ? handleBulkHardDelete : handleBulkMoveToTrash}
          onRestoreSelected={isTrash ? handleBulkRestore : undefined}
          isProcessing={isBulkProcessing}
        />
      )}

      {/* Quick Capture Floating Overlay */}
      {isQuickCaptureOpen && (
        <QuickCaptureModal
          isOpen={isQuickCaptureOpen}
          onClose={() => setIsQuickCaptureOpen(false)}
          collections={collections}
          token={currentUser.token}
          userId={currentUser.uuid}
          onCardCreated={newCard => {
            setAllDbCards(prev => [newCard, ...prev]);
          }}
        />
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          userEmail={currentUser.email}
          userId={currentUser.uuid}
          onLogout={handleLogout}
          onShortcutUpdated={() => {}}
        />
      )}

      {/* Card Detail Modal */}
      {modalCard && (
        <CardDetailModal
          card={modalCard}
          onClose={() => setModalCard(null)}
          collections={collections}
          token={currentUser.token}
          userId={currentUser.uuid}
          onCardUpdated={updatedCard => {
            setModalCard(updatedCard);
            setAllDbCards(prev =>
              prev.map(c => (c.cardId === updatedCard.cardId ? updatedCard : c))
            );
          }}
          onOpenCreateCollection={() =>
            setCollectionModalState({ isOpen: true, mode: 'CREATE' })
          }
          onCollectionCreated={savedCol => {
            setCollections(prev => [...prev, savedCol]);
          }}
          onToggleTodo={handleToggleTodo}
          onRestoreCard={handleRestoreSingleCard}
          onDeleteCard={handleDeleteSingleCard}
        />
      )}

      {/* Collection Create/Edit Modal */}
      {collectionModalState.isOpen && (
        <CollectionModal
          isOpen={collectionModalState.isOpen}
          onClose={() => setCollectionModalState({ isOpen: false, mode: 'CREATE' })}
          mode={collectionModalState.mode}
          collection={collectionModalState.collection}
          token={currentUser.token}
          userId={currentUser.uuid}
          onCollectionSaved={savedCol => {
            setCollections(prev => {
              const idx = prev.findIndex(c => c.collectionId === savedCol.collectionId);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = savedCol;
                return next;
              }
              return [...prev, savedCol];
            });
          }}
          onCollectionDeleted={deletedId => {
            setCollections(prev => prev.filter(c => c.collectionId !== deletedId));
          }}
        />
      )}

      {/* Bulk Assign Collection Modal */}
      {isSelectCollectionModalOpen && (
        <SelectCollectionModal
          isOpen={isSelectCollectionModalOpen}
          onClose={() => setIsSelectCollectionModalOpen(false)}
          collections={collections}
          selectedCardCount={selectedCardIds.size}
          token={currentUser.token}
          userId={currentUser.uuid}
          onAssign={handleBulkAssignCollection}
          onOpenCreateCollection={() => {
            setCollectionModalState({ isOpen: true, mode: 'CREATE' });
          }}
          onCollectionCreated={savedCol => {
            setCollections(prev => [...prev, savedCol]);
          }}
        />
      )}

      {/* Create Note Modal (manual) */}
      {isCreateNoteOpen && (
        <CreateNoteModal
          isOpen={isCreateNoteOpen}
          onClose={() => setIsCreateNoteOpen(false)}
          collections={collections}
          activeCollectionId={activeCollection}
          token={currentUser.token}
          userId={currentUser.uuid}
          onCardCreated={newCard => {
            setAllDbCards(prev => [newCard, ...prev]);
          }}
          onCollectionCreated={savedCol => {
            setCollections(prev => [...prev, savedCol]);
          }}
        />
      )}
    </div>
  );
}
