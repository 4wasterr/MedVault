import React, { useMemo, useState } from 'react';
import './AdminDataGrid.css';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const pageSize = 25;

export default function AdminDataGrid({ rows, columns, rowKey, label, emptyMessage, resetKey = '', defaultSort = 'name', itemLabel = 'records' }) {
  const [sort, setSort] = useState({ column: defaultSort, order: 'asc' });
  const [pagination, setPagination] = useState({ page: 1, resetKey });
  const sorted = useMemo(() => {
    const column = columns.find(item => item.key === sort.column);
    if (!column?.value) return rows;
    return [...rows].sort((left, right) => collator.compare(String(column.value(left) ?? ''), String(column.value(right) ?? '')) * (sort.order === 'asc' ? 1 : -1));
  }, [rows, columns, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = pagination.resetKey === resetKey ? Math.min(pagination.page, pages) : 1;
  // Reset filters and clamp removed rows without resetting on background refreshes.
  if (pagination.resetKey !== resetKey || pagination.page !== page) setPagination({ page, resetKey });
  const start = (page - 1) * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);
  const goTo = next => setPagination({ page: next, resetKey });
  const sortBy = column => {
    setSort(current => ({ column, order: current.column === column && current.order === 'asc' ? 'desc' : 'asc' }));
    goTo(1);
  };

  return <div className="admin-data-grid">
    <div className="admin-grid-meta"><span>{sorted.length} {itemLabel}</span><span>Click a column heading to sort</span></div>
    <div className="admin-grid-scroll" role="region" tabIndex={0} aria-label={`${label} table`}>
      <table className="admin-grid-table">
        <caption className="admin-grid-sr-only">{label}. Sortable columns and actions for each record.</caption>
        <thead><tr>{columns.map(column => <th key={column.key} scope="col" className={column.className}
          aria-sort={column.value ? sort.column === column.key ? sort.order === 'asc' ? 'ascending' : 'descending' : 'none' : undefined}>
          {column.value ? <button type="button" className="admin-grid-sort" onClick={() => sortBy(column.key)}>
            {column.label}<span aria-hidden="true">{sort.column === column.key ? sort.order === 'asc' ? '↑' : '↓' : '↕'}</span>
          </button> : column.label}
        </th>)}</tr></thead>
        <tbody>{pageRows.map(row => <tr key={rowKey(row)}>{columns.map(column => <td key={column.key} className={column.className}>
          {column.render ? column.render(row) : column.value(row) || '—'}
        </td>)}</tr>)}
          {!pageRows.length && <tr><td colSpan={columns.length} className="admin-grid-empty">{emptyMessage}</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="admin-grid-pagination">
      <span role="status">{sorted.length ? `${start + 1}–${Math.min(start + pageSize, sorted.length)} of ${sorted.length} ${itemLabel}` : `0 ${itemLabel}`}</span>
      <div className="admin-grid-page-controls">
        <button type="button" className="medsec-btn secondary" disabled={page <= 1} onClick={() => goTo(page - 1)}>Previous</button>
        <span>Page {page} of {pages}</span>
        <button type="button" className="medsec-btn secondary" disabled={page >= pages} onClick={() => goTo(page + 1)}>Next</button>
      </div>
    </div>
  </div>;
}
