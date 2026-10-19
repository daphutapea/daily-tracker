import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ListBulletsIcon,
  ListChecksIcon,
  ListNumbersIcon,
  TableIcon,
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TextBIcon,
  TextHThreeIcon,
  TextItalicIcon,
  type Icon,
} from '@phosphor-icons/react'
import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from '@tiptap/react'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { TextAlign } from '@tiptap/extension-text-align'
import { Placeholder } from '@tiptap/extensions'
import { StarterKit } from '@tiptap/starter-kit'

export interface RichValue {
  json: JSONContent
  text: string
}

export function RichEditor({
  initial,
  onChange,
  placeholder = 'Write notes, minutes, or paste a table…',
  label,
  minHeight = 180,
}: {
  initial: JSONContent | null
  onChange: (value: RichValue) => void
  placeholder?: string
  label: string
  minHeight?: number
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: true } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder }),
    ],
    content: initial ?? '',
    editorProps: {
      attributes: {
        class: 'prose-editor',
        'aria-label': label,
        style: `min-height:${minHeight}px`,
      },
    },
    // Plain text is kept alongside the JSON for search and previews; empty table cells would leave runs of blank lines.
    onUpdate: ({ editor }) =>
      onChange({
        json: editor.getJSON(),
        text: editor
          .getText({ blockSeparator: '\n' })
          .replace(/\n{3,}/g, '\n\n')
          .trim(),
      }),
  })

  return (
    <div className="rounded-[6px] border border-line-strong bg-surface focus-within:outline-2 focus-within:outline-accent">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      h3: editor.isActive('heading', { level: 3 }),
      bullet: editor.isActive('bulletList'),
      ordered: editor.isActive('orderedList'),
      task: editor.isActive('taskList'),
      inTable: editor.isActive('table'),
      left: editor.isActive({ textAlign: 'left' }),
      center: editor.isActive({ textAlign: 'center' }),
      right: editor.isActive({ textAlign: 'right' }),
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
    }),
  })
  const run = (fn: (c: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => fn(editor.chain().focus()).run()

  return (
    <div role="toolbar" aria-label="Formatting" className="border-b border-line bg-surface-2/60">
      <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1">
        <Tool icon={TextBIcon} label="Bold" active={s.bold} onClick={() => run((c) => c.toggleBold())} />
        <Tool icon={TextItalicIcon} label="Italic" active={s.italic} onClick={() => run((c) => c.toggleItalic())} />
        <Tool icon={TextHThreeIcon} label="Heading" active={s.h3} onClick={() => run((c) => c.toggleHeading({ level: 3 }))} />
        <Divider />
        <Tool icon={ListBulletsIcon} label="Bulleted list" active={s.bullet} onClick={() => run((c) => c.toggleBulletList())} />
        <Tool icon={ListNumbersIcon} label="Numbered list" active={s.ordered} onClick={() => run((c) => c.toggleOrderedList())} />
        <Tool icon={ListChecksIcon} label="Checklist" active={s.task} onClick={() => run((c) => c.toggleTaskList())} />
        <Tool
          icon={TableIcon}
          label={s.inTable ? 'Table (cursor is in a table)' : 'Insert table'}
          active={s.inTable}
          onClick={() => !s.inTable && run((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }))}
        />
        <Divider />
        <Tool icon={TextAlignLeftIcon} label="Align left" active={s.left} onClick={() => run((c) => c.setTextAlign('left'))} />
        <Tool icon={TextAlignCenterIcon} label="Align center" active={s.center} onClick={() => run((c) => c.setTextAlign('center'))} />
        <Tool icon={TextAlignRightIcon} label="Align right" active={s.right} onClick={() => run((c) => c.setTextAlign('right'))} />
        <Divider />
        <Tool icon={ArrowCounterClockwiseIcon} label="Undo" disabled={!s.canUndo} onClick={() => run((c) => c.undo())} />
        <Tool icon={ArrowClockwiseIcon} label="Redo" disabled={!s.canRedo} onClick={() => run((c) => c.redo())} />
      </div>
      {s.inTable && (
        <div className="flex flex-wrap items-center gap-1 border-t border-line px-2 py-1 text-[13px]">
          <span className="mr-1 text-ink-3">Table</span>
          <TextTool onClick={() => run((c) => c.addRowAfter())}>Add row</TextTool>
          <TextTool onClick={() => run((c) => c.addColumnAfter())}>Add column</TextTool>
          <TextTool onClick={() => run((c) => c.deleteRow())}>Remove row</TextTool>
          <TextTool onClick={() => run((c) => c.deleteColumn())}>Remove column</TextTool>
          <TextTool onClick={() => run((c) => c.toggleHeaderRow())}>Header row</TextTool>
          <TextTool danger onClick={() => run((c) => c.deleteTable())}>
            Delete table
          </TextTool>
        </div>
      )}
    </div>
  )
}

function Tool({
  icon: I,
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  icon: Icon
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`press grid size-8 place-items-center rounded-[5px] disabled:opacity-40 pointer-coarse:size-11 ${
        active ? 'bg-surface text-ink shadow-[inset_0_0_0_1px_var(--line-strong)]' : 'text-ink-2'
      }`}
    >
      <I size={17} weight="bold" />
    </button>
  )
}

function TextTool({ children, onClick, danger }: { children: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`press min-h-7 rounded-[5px] px-2 font-medium pointer-coarse:min-h-11 ${danger ? 'text-danger' : 'text-ink-2'}`}
    >
      {children}
    </button>
  )
}

const Divider = () => <span aria-hidden className="mx-1 h-5 w-px bg-line" />
