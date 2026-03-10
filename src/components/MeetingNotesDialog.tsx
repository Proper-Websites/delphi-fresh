import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useLocalStorageState } from "@/hooks/use-local-storage";
import { GlassScrollArea } from "@/components/ui/glass-scroll-area";

type Note = {
  id: number;
  text: string;
  createdAt: string;
  updatedAt?: string;
};

type NotesStore = Record<string, Note[]>;

const NOTES_KEY = "delphi_meeting_notes_v1";

interface MeetingNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scopeKey: string;
  title: string;
}

export function MeetingNotesDialog({ open, onOpenChange, scopeKey, title }: MeetingNotesDialogProps) {
  const [store, setStore] = useLocalStorageState<NotesStore>(NOTES_KEY, {});
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  const notes = useMemo(() => store[scopeKey] ?? [], [store, scopeKey]);

  const saveScopeNotes = (next: Note[]) => {
    setStore((prev) => ({ ...prev, [scopeKey]: next }));
  };

  const handleAdd = () => {
    const text = draft.trim();
    if (!text) return;
    const next: Note = {
      id: Date.now(),
      text,
      createdAt: new Date().toISOString(),
    };
    saveScopeNotes([next, ...notes]);
    setDraft("");
  };

  const handleDelete = (id: number) => {
    saveScopeNotes(notes.filter((note) => note.id !== id));
  };

  const startEdit = (note: Note) => {
    setEditingId(note.id);
    setEditingText(note.text);
  };

  const commitEdit = () => {
    if (editingId === null) return;
    const text = editingText.trim();
    if (!text) return;
    saveScopeNotes(
      notes.map((note) =>
        note.id === editingId
          ? { ...note, text, updatedAt: new Date().toISOString() }
          : note
      )
    );
    setEditingId(null);
    setEditingText("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="form-dialog-shell max-w-3xl p-0">
        <div className="p-6">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold tracking-tight">{title}</DialogTitle>
          </DialogHeader>

          <div className="mt-4 space-y-3">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Add meeting notes..."
              className="min-h-[120px]"
            />
            <div className="flex justify-end">
              <Button onClick={handleAdd}>Add Note</Button>
            </div>
          </div>

          <GlassScrollArea className="glass-scrollbar mt-5 max-h-[420px] space-y-3 overflow-y-auto pr-1">
            {notes.length === 0 ? (
              <div className="rounded-xl border border-border/60 bg-card/70 p-4 text-sm text-muted-foreground">
                No meeting notes yet.
              </div>
            ) : (
              notes.map((note) => (
                <div key={note.id} className="rounded-xl border border-border/60 bg-card/72 p-4">
                  {editingId === note.id ? (
                    <div className="space-y-3">
                      <Input
                        value={editingText}
                        onChange={(event) => setEditingText(event.target.value)}
                      />
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                        <Button onClick={commitEdit}>Save</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-base text-foreground whitespace-pre-wrap">{note.text}</p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          {new Date(note.updatedAt || note.createdAt).toLocaleString("en-US")}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => startEdit(note)}>
                            Edit
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleDelete(note.id)}>
                            Delete
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </GlassScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
