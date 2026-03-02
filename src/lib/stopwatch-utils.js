/**
 * Pure formatting utilities for stopwatch display
 */

/**
 * Format time without milliseconds for live timer display
 * @param {number} ms - Time in milliseconds
 * @returns {string} Formatted time string (hh:mm:ss)
 */
export function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Format timestamp date as yyyy-MM-dd
 * @param {number} timestamp - Timestamp in milliseconds
 * @returns {string} Formatted date string
 */
export function formatDate(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format timestamp time as HH:mm:ss
 * @param {number} timestamp - Timestamp in milliseconds
 * @returns {string} Formatted time string
 */
export function formatTimeOnly(timestamp) {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Format elapsed time as hh:mm with 1-minute minimum display
 * @param {number} minutes - Time in minutes
 * @returns {string} Formatted elapsed time
 */
export function formatElapsed(minutes) {
  const displayMinutes = minutes < 1 ? 1 : minutes;
  const hours = Math.floor(displayMinutes / 60);
  const mins = displayMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}
