import { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Node,
  Edge,
  Connection,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  BackgroundVariant,
  Panel,
  MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';
import FlowNode from './FlowNode';
import { TerminatorNode, DiamondNode, DocumentNode } from './ShapeNodes';
import NodeDetail from './NodeDetail';
import { initialNodes, initialEdges } from '@/data/flowData';
import { Button } from './ui/button';
import { 
  Plus, 
  Save, 
  Download, 
  Trash, 
  Undo, 
  Redo, 
  ZoomIn, 
  ZoomOut,
  Columns,
  ImageDown,
  HelpCircle
} from 'lucide-react';
import { toast } from 'sonner';
import NodeCreationModal from './NodeCreationModal';
import AddColumnModal from './AddColumnModal';
import { columns } from '@/data/flowData';
import { toPng } from 'html-to-image';
import ShortcutHelpModal from './ShortcutHelpModal'; // New component for showing keyboard shortcuts

const nodeTypes = {
  customNode: FlowNode,
  terminatorNode: TerminatorNode,
  diamondNode: DiamondNode,
  documentNode: DocumentNode,
};

const FlowChart = () => {
  const [nodes, setNodes] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false); // New state for shortcut help modal
  const [availableColumns, setAvailableColumns] = useState(columns);
  const [undoStack, setUndoStack] = useState<Array<{ nodes: Node[], edges: Edge[] }>>([]);
  const [redoStack, setRedoStack] = useState<Array<{ nodes: Node[], edges: Edge[] }>>([]);
  
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useRef<any>(null);

  // Gunakan useCallback untuk memastikan fungsi snapshot mengacu pada state terkini.
  const saveCurrentState = useCallback(() => {
    setUndoStack(prev => [...prev, { 
      nodes: JSON.parse(JSON.stringify(nodes)), 
      edges: JSON.parse(JSON.stringify(edges)) 
    }]);
    setRedoStack([]);
  }, [nodes, edges]);

  // Catat perubahan selain perubahan posisi atau select.
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const nonPositionChanges = changes.filter(
        change => change.type !== 'position' && change.type !== 'select'
      );
      if (nonPositionChanges.length > 0) {
        saveCurrentState();
      }
      setNodes(nds => applyNodeChanges(changes, nds));
    },
    [saveCurrentState, setNodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const nonSelectChanges = changes.filter(change => change.type !== 'select');
      if (nonSelectChanges.length > 0) {
        saveCurrentState();
      }
      setEdges(eds => applyEdgeChanges(changes, eds));
    },
    [saveCurrentState, setEdges]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      saveCurrentState();
      setEdges(eds => addEdge({ 
        ...params, 
        animated: true,
        style: { strokeWidth: 2, stroke: '#555' },
        data: { label: 'Hubungan' },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: '#555'
        }
      }, eds));
      toast.success('Elemen berhasil dihubungkan');
    },
    [saveCurrentState, setEdges]
  );

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  };
  
  const onEdgeClick = (_: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  };

  const onPaneClick = () => {
    setSelectedNode(null);
    setSelectedEdge(null);
  };

  const closeDetails = () => {
    setSelectedNode(null);
    setSelectedEdge(null);
  };

  // Tambahkan callback untuk menangkap event ketika drag node selesai,
  // sehingga satu perubahan posisi (drag) menghasilkan satu snapshot undo.
  const onNodeDragStop = useCallback(() => {
    saveCurrentState();
  }, [saveCurrentState]);

  const handleCreateNode = (nodeData: Omit<Node, "id" | "position">) => {
    saveCurrentState();
    const sameColumnNodes = nodes.filter(node => 
      node.data.column === nodeData.data.column && !node.data.isHeader
    );
    
    let y = 100;
    if (sameColumnNodes.length > 0) {
      const maxY = Math.max(...sameColumnNodes.map(node => node.position.y));
      y = maxY + 120;
    }
    
    const columnIndex = availableColumns.findIndex(col => col.id === nodeData.data.column);
    const nodeWidth = 180;
    const gap = 80;
    const x = columnIndex * (200 + gap) + (200 - nodeWidth) / 2;
    
    const newNode = {
      id: `node-${Date.now()}`,
      type: nodeData.type,
      position: { x, y },
      data: nodeData.data
    };
    
    setNodes(nds => [...nds, newNode]);
  };

  const addColumn = (columnData: { id: string; title: string; color: string }) => {
    saveCurrentState();
    
    // Add the new column to available columns
    setAvailableColumns(prevColumns => [...prevColumns, columnData]);
    
    // Use prevColumns.length for correct positioning of the new column
    // This ensures we're using the actual current length before addition
    const columnIndex = availableColumns.length;
    const columnWidth = 200;
    const gap = 80;
    const nodeWidth = 180;
    const x = columnIndex * (columnWidth + gap) + (columnWidth - nodeWidth) / 2;
    
    // Create the header node for the new column
    const headerNode = {
      id: `header-${columnData.id}`,
      type: 'customNode',
      position: { x, y: 10 },
      data: { 
        label: columnData.title,
        isHeader: true,
        column: columnData.id,
        // Use the hex color directly in the node data
        color: columnData.color
      },
      draggable: false,
      // You might need to add this style property if your CustomNode renders with inline styles
      style: { 
        backgroundColor: columnData.color 
      }
    };
    
    // Add the new node to the flow
    setNodes(nds => [...nds, headerNode]);
    toast.success(`Kolom ${columnData.title} berhasil ditambahkan`);
  };

  const updateNode = (nodeId: string, data: any) => {
    saveCurrentState();
    setNodes(nds =>
      nds.map(node => 
        node.id === nodeId ? { ...node, data: data } : node
      )
    );
  };

  const deleteNode = (nodeId: string) => {
    saveCurrentState();
    setNodes(nds => nds.filter(node => node.id !== nodeId));
    setEdges(eds => eds.filter(edge => edge.source !== nodeId && edge.target !== nodeId));
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const currentState = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges))
    };
    const previousState = undoStack[undoStack.length - 1];
    setRedoStack(prev => [...prev, currentState]);
    setUndoStack(prev => prev.slice(0, -1));
    setNodes(previousState.nodes);
    setEdges(previousState.edges);
    toast.info("Undo berhasil");
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const currentState = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges))
    };
    const nextState = redoStack[redoStack.length - 1];
    setUndoStack(prev => [...prev, currentState]);
    setRedoStack(prev => prev.slice(0, -1));
    setNodes(nextState.nodes);
    setEdges(nextState.edges);
    toast.info("Redo berhasil");
  };

  const handleSave = () => {
    const flowData = {
      nodes: nodes.filter(node => !node.data.isHeader),
      edges
    };
    localStorage.setItem('flowChart', JSON.stringify(flowData));
    toast.success("Diagram berhasil disimpan");
  };

  const handleExport = () => {
    if (reactFlowInstance.current) {
      const flowData = reactFlowInstance.current.toObject();
      const dataStr = JSON.stringify(flowData);
      const dataUri =
        'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
      const exportFileDefaultName = 'flowchart-export.json';
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
      toast.success("Diagram berhasil diexport");
    }
  };

  const handleSaveAsImage = () => {
    if (!reactFlowWrapper.current) {
      toast.error("Referensi diagram tidak ditemukan");
      return;
    }
  
    const reactFlowNode = reactFlowWrapper.current.querySelector('.react-flow');
    
    if (!reactFlowNode) {
      toast.error("Tidak dapat menemukan elemen diagram");
      return;
    }
    
    toast.info("Sedang memproses gambar...");
    
    const viewport = reactFlowNode.querySelector('.react-flow__viewport');
    const targetElement = viewport || reactFlowNode;
    
    if (!targetElement) {
      toast.error("Tidak dapat menemukan konten diagram");
      return;
    }
  
    setTimeout(() => {
      toPng(targetElement, { 
        backgroundColor: '#ffffff',
        quality: 1,
        pixelRatio: 2,
        cacheBust: true, 
        filter: (node) => {
          if (!node) return true;
          
          let classStr = "";
          
          if (node.className !== undefined && node.className !== null) {
            if (typeof node.className === 'string') {
              classStr = node.className;
            } else if (node.className.baseVal !== undefined) {
              classStr = node.className.baseVal;
            } else if (typeof node.className.toString === 'function') {
              classStr = node.className.toString();
            }
          }
          
          const checkClass = (str, className) => {
            return str.indexOf(className) === -1;
          };
          
          return checkClass(classStr, 'react-flow__controls') && 
                 checkClass(classStr, 'react-flow__minimap') && 
                 checkClass(classStr, 'react-flow__panel') &&
                 checkClass(classStr, 'toast-');
        }
      })
      .then((dataUrl) => {
        const tanggal = new Date().toISOString().split('T')[0];
        const link = document.createElement('a');
        link.download = `flowchart-${tanggal}.png`;
        link.href = dataUrl;
        link.click();
        toast.success("Diagram berhasil disimpan sebagai gambar");
      })
      .catch((error) => {
        console.error('Error saat menyimpan gambar:', error);
        toast.error("Gagal menyimpan gambar: " + error.message);
        
        try {
          toPng(targetElement, { 
            backgroundColor: '#ffffff',
            quality: 1,
            pixelRatio: 2
          })
          .then((dataUrl) => {
            const tanggal = new Date().toISOString().split('T')[0];
            const link = document.createElement('a');
            link.download = `flowchart-${tanggal}-alt.png`;
            link.href = dataUrl;
            link.click();
            toast.success("Diagram berhasil disimpan dengan metode alternatif");
          })
          .catch((fallbackError) => {
            toast.error("Semua metode gagal menyimpan gambar");
          });
        } catch (fallbackError) {
          toast.error("Gagal menggunakan metode alternatif");
        }
      });
    }, 100);
  };

  const handleZoomIn = () => {
    if (reactFlowInstance.current) {
      reactFlowInstance.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (reactFlowInstance.current) {
      reactFlowInstance.current.zoomOut();
    }
  };

  const handleFitView = () => {
    if (reactFlowInstance.current) {
      reactFlowInstance.current.fitView();
    }
  };

  // Add keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Skip handling if user is typing in an input field
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        return;
      }

      const ctrlOrCmd = event.ctrlKey || event.metaKey;

      // Add Node: Ctrl/Cmd + N
      if (ctrlOrCmd && event.key === 'n') {
        event.preventDefault();
        setIsModalOpen(true);
      }
      // Add Column: Ctrl/Cmd + Shift + C
      else if (ctrlOrCmd && event.shiftKey && event.key === 'c') {
        event.preventDefault();
        setIsColumnModalOpen(true);
      }
      // Undo: Ctrl/Cmd + Z
      else if (ctrlOrCmd && !event.shiftKey && event.key === 'z' && undoStack.length > 0) {
        event.preventDefault();
        handleUndo();
      }
      // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
      else if ((ctrlOrCmd && event.shiftKey && event.key === 'z') || 
               (ctrlOrCmd && event.key === 'y')) {
        event.preventDefault();
        if (redoStack.length > 0) handleRedo();
      }
      // Save: Ctrl/Cmd + S
      else if (ctrlOrCmd && !event.shiftKey && event.key === 's') {
        event.preventDefault();
        handleSaveAsImage();
      }
      // Export: Ctrl/Cmd + E
      else if (ctrlOrCmd && event.key === 'e') {
        event.preventDefault();
        handleExport();
      }
      // Save as Image: Ctrl/Cmd + Shift + S
      // else if (ctrlOrCmd && event.shiftKey && event.key === 's') {
      //   event.preventDefault();
      //   handleSaveAsImage();
      // }
      // Zoom In: Ctrl/Cmd + Plus or Ctrl/Cmd + =
      else if (ctrlOrCmd && (event.key === '+' || event.key === '=')) {
        event.preventDefault();
        handleZoomIn();
      }
      // Zoom Out: Ctrl/Cmd + Minus
      else if (ctrlOrCmd && event.key === '-') {
        event.preventDefault();
        handleZoomOut();
      }
      // Fit View: Ctrl/Cmd + 0 
      else if (ctrlOrCmd && event.key === '0') {
        event.preventDefault();
        handleFitView();
      }
      // Delete selected node: Delete key
      else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNode) {
        event.preventDefault();
        deleteNode(selectedNode.id);
        setSelectedNode(null);
      }
      // Show Shortcut Help: ? key
      else if (event.key === '?') {
        event.preventDefault();
        setIsShortcutHelpOpen(true);
      }
    };

    // Add event listener
    document.addEventListener('keydown', handleKeyDown);
    
    // Clean up
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    setIsModalOpen, setIsColumnModalOpen, 
    handleUndo, handleRedo, undoStack.length, redoStack.length,
    handleSave, handleExport, handleSaveAsImage,
    handleZoomIn, handleZoomOut, handleFitView, 
    selectedNode, deleteNode, setIsShortcutHelpOpen
  ]);

  return (
    <div className="h-full flex flex-col">
      {/* Bagian Header dengan button */}
      <div className="flex justify-between items-center p-2 bg-gray-100 rounded mb-2">
        <div className="flex items-center gap-2">
          <Button 
            size="sm" 
            onClick={() => setIsModalOpen(true)} 
            className="flex items-center gap-1"
            title="Tambah Elemen (Ctrl+N)"
          >
            <Plus size={16} />
            Tambah Elemen
          </Button>
          <Button 
            size="sm" 
            onClick={() => setIsColumnModalOpen(true)} 
            className="flex items-center gap-1"
            title="Tambah Kolom (Ctrl+Shift+C)"
          >
            <Columns size={16} />
            Tambah Kolom
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title="Undo (Ctrl+Z)"
          >
            <Undo size={16} />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            title="Redo (Ctrl+Shift+Z or Ctrl+Y)"
          >
            <Redo size={16} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsShortcutHelpOpen(true)}
            title="Bantuan Shortcut (Tekan ?)"
            className="ml-2"
          >
            <HelpCircle size={16} />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSave}
            title="Simpan (Ctrl+S)"
          >
            <Save size={16} className="mr-1" />
            Simpan
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
            title="Export (Ctrl+E)"
          >
            <Download size={16} className="mr-1" />
            Export
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSaveAsImage}
            title="Simpan sebagai Gambar (Ctrl+Shift+S)"
          >
            <ImageDown size={16} className="mr-1" />
            Simpan Gambar
          </Button>
        </div>
      </div>
      
      {/* Kontainer diagram dengan cursor kustom berwarna hitam */}
      <div 
        className="flex-1 relative" 
        ref={reactFlowWrapper}
        style={{
          cursor: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\'%3E%3Cpolygon points=\'0,0 0,16 4,12 8,0\' fill=\'black\'/%3E%3C/svg%3E") 0 0, auto'
        }}
      >
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={nodeTypes}
            onInit={(instance) => {
              reactFlowInstance.current = instance;
            }}
            fitView
            className="bg-gray-50"
            connectOnClick={true}
            deleteKeyCode={['Backspace', 'Delete']}
            multiSelectionKeyCode={['Control', 'Meta']}
            selectionKeyCode={['Shift']}
            defaultEdgeOptions={{
              type: 'default',
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 20,
                height: 20,
              },
            }}
          >
            <Controls />
            <MiniMap zoomable pannable />
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
            <Panel position="bottom-right" className="bg-white p-2 rounded shadow-sm">
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={handleZoomIn}
                  title="Perbesar (Ctrl+Plus)"
                >
                  <ZoomIn size={16} />
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={handleZoomOut}
                  title="Perkecil (Ctrl+Minus)"
                >
                  <ZoomOut size={16} />
                </Button>
              </div>
            </Panel>
          </ReactFlow>
        </ReactFlowProvider>
      </div>
      
      {selectedNode && (
        <NodeDetail 
          node={selectedNode} 
          onClose={closeDetails}
          onUpdate={updateNode}
          onDelete={deleteNode}
        />
      )}
      
      <NodeCreationModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onCreateNode={handleCreateNode}
        columns={availableColumns}
      />
      
      <AddColumnModal
        open={isColumnModalOpen}
        onOpenChange={setIsColumnModalOpen}
        onAddColumn={addColumn}
      />
      
      {/* Modal bantuan shortcut keyboard */}
      <ShortcutHelpModal
        open={isShortcutHelpOpen}
        onOpenChange={setIsShortcutHelpOpen}
      />
    </div>
  );
};

export default FlowChart;