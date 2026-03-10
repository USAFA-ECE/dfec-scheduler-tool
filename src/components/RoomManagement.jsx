import { useState } from 'react';
import { useApp } from '../data/store';
import { useSession } from '../data/session';

export default function RoomManagement() {
    const { state, dispatch } = useApp();
    const { isAdmin } = useSession();
    const { rooms } = state;
    const [showAddRoom, setShowAddRoom] = useState(false);
    const [editingRoom, setEditingRoom] = useState(null);
    const [deletingRoom, setDeletingRoom] = useState(null);
    const [newRoom, setNewRoom] = useState({ name: '', seats: 0, labTech: '' });

    const sortedRooms = [...rooms].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    function saveRoom() {
        if (!newRoom.name.trim()) return;
        if (editingRoom) {
            dispatch({ type: 'UPDATE_ROOM', payload: { id: editingRoom, ...newRoom } });
        } else {
            dispatch({ type: 'ADD_ROOM', payload: { id: `r-${newRoom.name.toLowerCase().replace(/\s+/g, '')}`, ...newRoom } });
        }
        resetForm();
    }

    function editRoom(room) {
        setNewRoom({ name: room.name, seats: room.seats, labTech: room.labTech || '' });
        setEditingRoom(room.id);
        setShowAddRoom(true);
    }

    function deleteRoom(id) {
        setDeletingRoom(id);
    }

    function confirmDeleteRoom() {
        if (deletingRoom) {
            dispatch({ type: 'DELETE_ROOM', payload: deletingRoom });
            setDeletingRoom(null);
        }
    }

    function resetForm() {
        setNewRoom({ name: '', seats: 0, labTech: '' });
        setEditingRoom(null);
        setShowAddRoom(false);
    }

    // Group rooms by lab tech for summary
    const labTechMap = {};
    rooms.forEach(r => {
        const tech = r.labTech || 'Unassigned';
        if (!labTechMap[tech]) labTechMap[tech] = [];
        labTechMap[tech].push(r.name);
    });

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Room Management</h1>
                    <p className="page-description">
                        Manage classrooms, labs, and lab tech assignments
                    </p>
                </div>
                {isAdmin && (
                    <div className="flex gap-1">
                        <button className="btn btn-primary" onClick={() => setShowAddRoom(true)}>
                            + Add Room
                        </button>
                    </div>
                )}
            </div>

            {/* Rooms Table */}
            <div className="card mb-2" style={{ padding: '0.5rem' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                                <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', width: 100 }}>Room</th>
                                <th style={{ textAlign: 'center', padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', width: 80 }}>Seats</th>
                                <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>Lab Tech</th>
                                <th style={{ width: 80 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedRooms.map(r => (
                                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {r.name}
                                    </td>
                                    <td style={{ textAlign: 'center', padding: '10px 12px', color: 'var(--text-secondary)' }}>
                                        {r.seats}
                                    </td>
                                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                                        {r.labTech || '—'}
                                    </td>
                                    <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                                        {isAdmin && (
                                            <>
                                                <button className="btn btn-ghost btn-sm" onClick={() => editRoom(r)}>✎</button>
                                                <button className="btn btn-ghost btn-sm" onClick={() => deleteRoom(r.id)}>✕</button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {rooms.length === 0 && (
                                <tr>
                                    <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                        No rooms added yet. Click "+ Add Room" to get started.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Lab Tech Summary */}
            {rooms.length > 0 && (
                <div className="card" style={{ padding: '1rem' }}>
                    <h3 className="card-title" style={{ marginBottom: '0.75rem' }}>Lab Tech Assignments</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '0.75rem' }}>
                        {Object.entries(labTechMap).sort((a, b) => a[0].localeCompare(b[0])).map(([tech, roomList]) => (
                            <div key={tech} style={{
                                background: 'var(--bg-tertiary)',
                                borderRadius: 8,
                                padding: '0.75rem 1rem',
                                border: '1px solid var(--border-color)',
                            }}>
                                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                                    {tech}
                                </div>
                                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                    {roomList.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(', ')}
                                    <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>({roomList.length} room{roomList.length !== 1 ? 's' : ''})</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Add/Edit Room Modal */}
            {showAddRoom && (
                <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) resetForm(); }}>
                    <div className="modal" style={{ maxWidth: 420 }}>
                        <h2 className="modal-title">{editingRoom ? 'Edit Room' : 'Add Room'}</h2>
                        <div className="form-group">
                            <label className="form-label">Room Number</label>
                            <input
                                type="text"
                                className="form-input"
                                value={newRoom.name}
                                onChange={e => setNewRoom({ ...newRoom, name: e.target.value })}
                                placeholder="e.g. 2E35"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Seats</label>
                            <input
                                type="number"
                                className="form-input"
                                value={newRoom.seats}
                                onChange={e => setNewRoom({ ...newRoom, seats: parseInt(e.target.value) || 0 })}
                                min={0}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Lab Tech</label>
                            <input
                                type="text"
                                className="form-input"
                                value={newRoom.labTech}
                                onChange={e => setNewRoom({ ...newRoom, labTech: e.target.value })}
                                placeholder="e.g. Eric Hall"
                            />
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={resetForm}>Cancel</button>
                            <button className="btn btn-primary" onClick={saveRoom}>
                                {editingRoom ? 'Save Changes' : 'Add Room'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Room Confirmation Modal */}
            {deletingRoom && (
                <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setDeletingRoom(null); }}>
                    <div className="modal" style={{ maxWidth: 400 }}>
                        <h2 className="modal-title">Remove Room?</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                            Are you sure you want to remove this room? This action cannot be undone.
                        </p>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setDeletingRoom(null)}>Cancel</button>
                            <button className="btn btn-primary" onClick={confirmDeleteRoom} style={{ background: '#ef4444' }}>
                                Remove
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
