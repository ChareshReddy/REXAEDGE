import React, { useState } from 'react';
import {
  Button,
  Input,
  Select,
  FieldWrapper,
  ValueHelpInput,
  Checkbox,
  Radio,
  Switch,
  Badge,
  Card,
  Tabs,
  DataTable,
  Modal,
  ToastBanner,
  EmptyState,
  FormSection,
  FormGrid,
  FormActions
} from '../ui';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import BomUsageValueHelpModal from '../BomUsageValueHelpModal';
import {
  Layers,
  ShieldCheck,
  Database,
  Box,
  Plus,
  Trash2,
  Search,
  ArrowRight,
  AlertTriangle,
  Copy,
  CheckCircle2,
  X
} from 'lucide-react';

export default function DesignSystemShowcase() {
  const [activeTab, setActiveTab] = useState('components');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isF4Open, setIsF4Open] = useState(false);
  const [selectedUsage, setSelectedUsage] = useState('1');
  const [checkboxVal, setCheckboxVal] = useState(true);
  const [radioVal, setRadioVal] = useState('option1');
  const [switchVal, setSwitchVal] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [tableSelected, setTableSelected] = useState('MAT-002');

  const demoColumns = [
    { key: 'item', title: 'Item', width: '60px', isMono: true },
    { key: 'matnr', title: 'Component', width: '160px', isMono: true },
    { key: 'maktx', title: 'Description', minWidth: '220px' },
    { key: 'menge', title: 'Quantity', width: '100px', align: 'right', isMono: true },
    { key: 'meins', title: 'Unit', width: '80px', align: 'center', isMono: true },
    {
      key: 'status',
      title: 'Status',
      width: '120px',
      render: (val) => (
        <Badge variant={val === 'Active' ? 'success' : 'warning'}>{val}</Badge>
      )
    }
  ];

  const demoData = [
    { id: 'MAT-001', item: '0010', matnr: 'RAW-STEEL-100', maktx: 'Cold Rolled Steel Plate 10mm', menge: '25.000', meins: 'KG', status: 'Active' },
    { id: 'MAT-002', item: '0020', matnr: 'BOLT-M12-50', maktx: 'Hex Head Bolt M12 x 50 Zinc', menge: '120.000', meins: 'PC', status: 'Active' },
    { id: 'MAT-003', item: '0030', matnr: 'GASKET-RUB-01', maktx: 'EPDM Rubber Flange Gasket', menge: '4.000', meins: 'PC', status: 'Pending' }
  ];

  const sampleToasts = [
    { id: 't1', type: 'success', title: 'Operation successful', message: 'Bill of Materials 00001049 saved into SAP S/4HANA.' },
    { id: 't2', type: 'danger', title: 'Validation error', message: 'Plant 1000 has not been extended for component RAW-STEEL-100.' }
  ];

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: '32px 24px', fontFamily: 'var(--font-sans)', color: 'var(--color-text)' }}>
      {/* Header */}
      <div style={{ marginBottom: 32, borderBottom: '1px solid var(--color-border)', paddingBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Badge variant="info">Dev Only Route</Badge>
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>RexaEdge Enterprise Design System</span>
        </div>
        <h1 style={{ fontSize: 'var(--font-size-30)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-navy-900)', margin: 0 }}>
          "Beautiful Blues" Design System Showcase
        </h1>
        <p style={{ fontSize: 'var(--font-size-14)', color: 'var(--color-text-secondary)', marginTop: 8, marginBottom: 0 }}>
          Interactive stakeholder review environment for tokens, form fields, placements, card variants, F4 popups, and tables.
        </p>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'components', label: 'Field States & Controls', icon: Layers },
          { id: 'placements', label: 'Form Layout & Card Variants', icon: Box },
          { id: 'palette', label: 'Color Tokens & Typography', icon: Database },
          { id: 'feedback', label: 'Popups, Toasts & Modals', icon: ShieldCheck }
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
        style={{ marginBottom: 32 }}
      />

      {/* TAB 1: FIELD STATES & CONTROLS */}
      {activeTab === 'components' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {/* Field States Showcase */}
          <Card title="Field States (13px Semibold Label, 40px Height, 8px Radius, Hover, Focus, Error, Warning, Disabled)">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
              <FieldWrapper label="Default State" hint="Standard 40px input with 1px neutral border">
                <Input placeholder="Enter value..." />
              </FieldWrapper>

              <FieldWrapper label="Hover & Focus State" hint="Border darkens on hover, blue-600 + 3px soft ring on focus">
                <Input defaultValue="Focused or hovered field" autoFocus />
              </FieldWrapper>

              <FieldWrapper label="Monospace & Uppercase (SAP)" required hint="JetBrains Mono with auto-uppercase">
                <Input defaultValue="a1bh0214c" isMono isUppercase />
              </FieldWrapper>

              <FieldWrapper label="Disabled / Read-Only State" hint="Blue-50 background, muted text, no ring">
                <Input defaultValue="READ-ONLY-KEY" disabled />
              </FieldWrapper>

              <FieldWrapper label="Error State" required error="Material number does not exist in plant 1010">
                <Input defaultValue="MAT-INVALID" hasError />
              </FieldWrapper>

              <FieldWrapper label="Warning State" warning="Component marked for phase-out at end of quarter">
                <Input defaultValue="COMP-PHASEOUT" hasWarning />
              </FieldWrapper>

              <FieldWrapper label="Embedded F4 Value Help" required hint="28px button inside field, focus ring wraps both">
                <ValueHelpInput
                  value={selectedUsage}
                  onChange={(e) => setSelectedUsage(e.target.value)}
                  placeholder="Ex. 1"
                  onOpenValueHelp={() => setIsF4Open(true)}
                />
              </FieldWrapper>

              <FieldWrapper label="Select Dropdown" required hint="40px height matching inputs">
                <Select defaultValue="1000">
                  <option value="1000">1000 - Hamburg Plant</option>
                  <option value="2000">2000 - Dresden Plant</option>
                  <option value="3000">3000 - US Assembly</option>
                </Select>
              </FieldWrapper>
            </div>

            {/* Table Cell Inputs Density (32px) */}
            <div className="mt-8 pt-6 border-t border-[var(--color-border)]">
              <h4 className="text-sm font-semibold text-[var(--color-navy-900)] mb-3">
                Table Cell Input Density (32px High, 6px Radius, 13px Text, fits 44px Row)
              </h4>
              <div className="flex flex-wrap gap-4 items-center">
                <div className="w-48">
                  <Input placeholder="32px cell input" isTable defaultValue="QTY: 100" />
                </div>
                <div className="w-48">
                  <ValueHelpInput placeholder="32px F4 cell" isTable defaultValue="SLOC: 0001" onOpenValueHelp={() => setIsF4Open(true)} />
                </div>
                <div className="w-32">
                  <Input placeholder="Error cell" isTable hasError defaultValue="ERR-01" />
                </div>
                <div className="w-32">
                  <Input placeholder="Disabled" isTable disabled defaultValue="LOCKED" />
                </div>
              </div>
            </div>

            {/* Checkboxes, Radios, Switches */}
            <div style={{ marginTop: 24, display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
              <Checkbox checked={checkboxVal} onChange={setCheckboxVal} label="Costing relevancy" />
              <Radio checked={radioVal === 'option1'} onChange={() => setRadioVal('option1')} label="Single-level" />
              <Radio checked={radioVal === 'option2'} onChange={() => setRadioVal('option2')} label="Multi-level" />
              <Switch checked={switchVal} onChange={setSwitchVal} label="Display technical keys" />
            </div>
          </Card>

          {/* Buttons Showcase */}
          <Card title="Buttons (Enterprise Variants & Sizes)">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginBottom: 20 }}>
              <Button variant="primary" icon={Plus}>Primary Action</Button>
              <Button variant="secondary" icon={Layers}>Secondary</Button>
              <Button variant="ghost">Ghost Button</Button>
              <Button variant="danger" icon={Trash2}>Destructive Action</Button>
              <Button variant="primary" isLoading>Loading State</Button>
              <Button variant="primary" disabled>Disabled</Button>
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <Button size="sm" variant="secondary">Small (32px)</Button>
              <Button size="md" variant="secondary">Standard (40px)</Button>
              <Button size="lg" variant="secondary">Large (44px)</Button>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 2: FORM LAYOUT & CARD VARIANTS */}
      {activeTab === 'placements' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {/* FormSection & FormGrid Structure */}
          <div>
            <h3 className="text-base font-semibold text-[var(--color-navy-900)] mb-2">
              1. FormSection + Responsive FormGrid (3 cols at &gt;=1280px, 2 cols at 900px, 1 col below)
            </h3>
            <FormSection
              title="Header Specification Card"
              description="Standard white surface, 1px border token, 12px radius, shadow-sm token, 20px padding"
              actions={
                <Badge variant="info">Section Active</Badge>
              }
            >
              <FormGrid>
                <FieldWrapper label="Material" required hint="Short field (1 col)">
                  <Input defaultValue="A1BH0214C" isMono isUppercase />
                </FieldWrapper>
                <FieldWrapper label="Plant" required hint="Short field (1 col)">
                  <Input defaultValue="1010" isMono isUppercase />
                </FieldWrapper>
                <FieldWrapper label="BOM Usage" required hint="Short field (1 col)">
                  <Input defaultValue="1" isMono />
                </FieldWrapper>
                <FieldWrapper label="Alternative Text Description" hint="Long field spanning 2 columns" className="md:col-span-2 xl:col-span-2">
                  <Input defaultValue="Main Electric Motor Drive Assembly with Heat Sink" />
                </FieldWrapper>
                <FieldWrapper label="Status" hint="Short field (1 col)">
                  <Select defaultValue="01">
                    <option value="01">01 - Active</option>
                    <option value="02">02 - Inactive</option>
                  </Select>
                </FieldWrapper>
              </FormGrid>
              <FormActions
                className="sap-card-action-row"
                left={<Button variant="secondary">Reset</Button>}
                right={<Button variant="primary">Save & Validate</Button>}
              />
            </FormSection>
          </div>

          {/* Copy BOM Dual Cards Variant */}
          <div>
            <h3 className="text-base font-semibold text-[var(--color-navy-900)] mb-2">
              2. Copy BOM Dual Cards (3px Blue-600 Top Accent Bar, Source/Target Badges, Center Arrow)
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-start gap-5">
              <FormSection
                title="Reference BOM"
                description="Select source bill of materials"
                badge={
                  <span className="font-semibold text-xs px-2.5 py-0.5 rounded-full bg-[var(--color-blue-50)] text-[var(--color-blue-600)] border border-[var(--color-blue-200)]">
                    Source
                  </span>
                }
                accentTop="3px solid var(--color-blue-600)"
                bodyClassName="flex flex-col gap-3"
              >
                <FieldWrapper label="Material" required>
                  <Input defaultValue="A1BH0214C" isMono isUppercase />
                </FieldWrapper>
                <FieldWrapper label="Plant" required>
                  <Input defaultValue="1001" isMono isUppercase />
                </FieldWrapper>
              </FormSection>

              <div className="hidden lg:flex flex-col items-center justify-center self-center my-auto p-2" aria-hidden="true">
                <div className="w-10 h-10 rounded-full bg-[var(--color-blue-50)] border border-[var(--color-blue-200)] flex items-center justify-center text-[var(--color-blue-600)] shadow-sm">
                  <ArrowRight size={18} strokeWidth={2} />
                </div>
              </div>

              <FormSection
                title="New BOM Destination"
                description="Target material and plant configuration"
                badge={
                  <span className="font-semibold text-xs px-2.5 py-0.5 rounded-full bg-[var(--color-blue-50)] text-[var(--color-blue-600)] border border-[var(--color-blue-200)]">
                    Target
                  </span>
                }
                accentTop="3px solid var(--color-blue-600)"
                bodyClassName="flex flex-col gap-3"
              >
                <FieldWrapper label="Material" required>
                  <Input defaultValue="A1BH0214C" isMono isUppercase />
                </FieldWrapper>
                <FieldWrapper label="Plant" required>
                  <Input defaultValue="1012" isMono isUppercase />
                </FieldWrapper>
              </FormSection>
            </div>
          </div>

          {/* Delete BOM Variant */}
          <div>
            <h3 className="text-base font-semibold text-[var(--color-navy-900)] mb-2">
              3. Delete BOM Variant (Neutral Card Preceded by Amber Warning Alert, Red only on Confirm)
            </h3>
            <Alert variant="warning" className="mb-4 bg-[var(--color-amber-50)] border-[var(--color-warning)] text-[var(--color-warning)]">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <AlertTitle className="font-semibold text-xs tracking-wide uppercase">Destructive Operation</AlertTitle>
              <AlertDescription className="text-xs text-[var(--color-text)]">
                Deleting a BOM removes component linkages in the specified plant. A safety confirmation check is required prior to execution.
              </AlertDescription>
            </Alert>
            <FormSection
              title="Delete Bill of Materials"
              description="Neutral card style without aggressive red header"
            >
              <FormGrid>
                <FieldWrapper label="Material Number" required>
                  <Input defaultValue="A1BH0214C" isMono isUppercase />
                </FieldWrapper>
                <FieldWrapper label="Plant Code" required>
                  <Input defaultValue="1001" isMono isUppercase />
                </FieldWrapper>
              </FormGrid>
              <FormActions
                className="sap-card-action-row"
                left={<Button variant="secondary">Cancel</Button>}
                right={<Button variant="primary">Proceed to Confirmation</Button>}
              />
            </FormSection>
          </div>
        </div>
      )}

      {/* TAB 3: PALETTE & TOKENS */}
      {activeTab === 'palette' && (
        <Card title="Beautiful Blues Palette Tokens">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
            {[
              { token: '--color-navy-900', hex: '#00204E', label: 'Navy 900 (Headings, Surfaces)' },
              { token: '--color-navy-800', hex: '#05396B', label: 'Navy 800 (Hover/Pressed)' },
              { token: '--color-blue-600', hex: '#02579A', label: 'Blue 600 (Primary Buttons)' },
              { token: '--color-blue-400', hex: '#6699B8', label: 'Blue 400 (Secondary Icons)' },
              { token: '--color-blue-200', hex: '#B3CDE0', label: 'Blue 200 (Focus Borders)' },
              { token: '--color-blue-100', hex: '#DCE8F1', label: 'Blue 100 (Selected Rows)' },
              { token: '--color-blue-50', hex: '#EEF4F9', label: 'Blue 50 (Table Header/Hover)' },
              { token: '--color-border-input', hex: '#C7D4E1', label: 'Border Input (40px field boundary)' },
              { token: '--color-border-input-hover', hex: '#98B5CE', label: 'Border Input Hover' },
              { token: '--color-page-bg', hex: '#F5F8FB', label: 'Page Background' },
              { token: '--color-surface', hex: '#FFFFFF', label: 'Surface Card' },
              { token: '--color-border', hex: '#D9E2EC', label: 'Border Neutral' }
            ].map((c) => (
              <div key={c.token} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <div style={{ height: 60, backgroundColor: c.hex }} />
                <div style={{ padding: '8px 12px' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-navy-900)' }}>{c.hex}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>{c.label}</div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', marginTop: 4 }}>{c.token}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* TAB 4: FEEDBACK, POPUPS & MODALS */}
      {activeTab === 'feedback' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* F4 Popup Trigger */}
          <Card title="SAP F4 Value Help Popup (52px Flat Blue-50 Header, Navy Title, F4 Badge, 36px Close, Draggable, No Backdrop Close)">
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
              Interactive demonstration of the real SAP F4 Value Help popup with table keyboard navigation, filtering, sticky key column, and immunity to background click dismissals.
            </p>
            <div className="flex items-center gap-4">
              <Button variant="primary" icon={Search} onClick={() => setIsF4Open(true)}>
                Open BOM Usage F4 Popup
              </Button>
              <span className="text-xs text-[var(--color-text-secondary)] font-mono">
                Current selection: Usage {selectedUsage}
              </span>
            </div>
          </Card>

          <Card title="Modal Dialog Demonstration">
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
              Enterprise dialogs do not dismiss on background backdrop click (only X, Cancel button, or Esc key).
            </p>
            <Button variant="secondary" onClick={() => setIsModalOpen(true)}>Open Modal Dialog</Button>
          </Card>

          <Card title="Toast Banner Notifications (Right-aligned under top bar, max 440px)">
            <ToastBanner toasts={sampleToasts} onDismiss={() => {}} />
          </Card>

          <Card title="Empty State">
            <EmptyState
              icon={Box}
              title="No Bill of Materials Selected"
              description="Enter a material number and plant above or browse from the catalog to load components."
              action={<Button variant="secondary">Browse Material Catalog</Button>}
            />
          </Card>

          {/* Data Table */}
          <Card title="Data Table (Sticky Header, Selected Row Blue-100, Hover Blue-50)">
            <DataTable
              columns={demoColumns}
              data={demoData}
              selectedRowKey={tableSelected}
              onRowSelect={(_, key) => setTableSelected(key)}
            />
          </Card>
        </div>
      )}

      {/* Confirmation Modal */}
      <Modal
        isOpen={isModalOpen}
        title="Confirm SAP Operation"
        onClose={() => setIsModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setIsModalOpen(false)}>Confirm & Execute</Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          This operation will post changes directly to SAP S/4HANA under system DEV. Ensure all item categories and unit quantities have been reviewed.
        </p>
      </Modal>

      {/* F4 Value Help Modal */}
      <BomUsageValueHelpModal
        isOpen={isF4Open}
        initialValue={selectedUsage}
        onSelect={(usage) => {
          setSelectedUsage(usage);
          setIsF4Open(false);
        }}
        onClose={() => setIsF4Open(false)}
      />
    </div>
  );
}
