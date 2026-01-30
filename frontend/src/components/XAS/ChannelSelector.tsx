/**
 * Channel Selector - Formula-based H5 channel selection for XAS data exploration.
 *
 * Features:
 * - Expression inputs for X and Y axes (e.g., "log(Ir_corr / I0)")
 * - Fuzzy autocomplete suggestions for channel names (matches anywhere in name)
 * - Selected channels displayed as blue chips with delete button
 * - Inline channel index organized by parent path
 * - Click channels to insert into focused input at cursor
 * - No np. prefix needed - just type log(), sin(), sqrt() etc.
 */

import { useState, useRef, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Divider,
  Button,
  Chip,
  TextField,
  Autocomplete,
  Popper,
  Paper,
  List,
  ListItemButton,
  ListItemText,
  IconButton,
  Collapse,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import ListIcon from '@mui/icons-material/List';
import CloseIcon from '@mui/icons-material/Close';
import CancelIcon from '@mui/icons-material/Cancel';
import { useXAS } from '../../contexts/XASContext';

const ELEMENTS = ['Ir', 'Pt', 'Co', 'Mn', 'Fe', 'Ni', 'Cu', 'Zn', 'Ti', 'V', 'Cr', 'Mo', 'W', 'Au', 'Ag', 'Pd', 'Rh', 'Ru'];

// Safe numpy functions (used to distinguish from channel names in preview)
const NUMPY_FUNCS = [
  'abs', 'sign', 'sqrt', 'square', 'power',
  'sin', 'cos', 'tan', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'exp', 'log', 'log10', 'log2', 'expm1', 'log1p',
  'floor', 'ceil', 'round', 'trunc',
  'pi', 'e',
];
const NUMPY_FUNCS_SET = new Set(NUMPY_FUNCS);

// Fuzzy match score - returns a score based on match quality (higher is better), or -1 if no match
function fuzzyMatchScore(text: string, query: string): number {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Exact match - highest priority
  if (lowerText === lowerQuery) return 1000;

  // Starts with query - high priority
  if (lowerText.startsWith(lowerQuery)) return 500 + (lowerQuery.length / lowerText.length) * 100;

  // Contains query as substring - medium priority
  const containsIndex = lowerText.indexOf(lowerQuery);
  if (containsIndex !== -1) {
    // Prefer matches at word boundaries (after __, /, or _)
    const charBefore = containsIndex > 0 ? lowerText[containsIndex - 1] : '';
    const isWordBoundary = charBefore === '_' || charBefore === '/';
    return (isWordBoundary ? 300 : 200) + (lowerQuery.length / lowerText.length) * 100;
  }

  // No match
  return -1;
}

// Parse expression to extract channel tokens (words that match known channels)
function parseExpressionTokens(
  expr: string,
  channelSet: Set<string>
): { type: 'channel' | 'text'; value: string; fullPath?: string }[] {
  if (!expr) return [];

  const tokens: { type: 'channel' | 'text'; value: string; fullPath?: string }[] = [];
  // Match channel-like identifiers (word characters including double underscore for paths)
  const regex = /([a-zA-Z_][a-zA-Z0-9_]*(?:__[a-zA-Z0-9_]+)?)/g;

  let lastIndex = 0;
  let match;

  while ((match = regex.exec(expr)) !== null) {
    // Add any text before this match
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: expr.slice(lastIndex, match.index) });
    }

    const word = match[1];
    // Check if it's a known channel (not a numpy function)
    if (channelSet.has(word) && !NUMPY_FUNCS_SET.has(word)) {
      tokens.push({ type: 'channel', value: word, fullPath: word });
    } else {
      tokens.push({ type: 'text', value: word });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add any remaining text
  if (lastIndex < expr.length) {
    tokens.push({ type: 'text', value: expr.slice(lastIndex) });
  }

  return tokens;
}

// Get the word at cursor position
function getWordAtCursor(value: string, cursorPos: number): { word: string; start: number; end: number } {
  let start = cursorPos;
  let end = cursorPos;

  // Move start back to beginning of word (including __ for paths)
  while (start > 0 && /[\w_]/.test(value[start - 1])) {
    start--;
  }

  // Move end forward to end of word
  while (end < value.length && /[\w_]/.test(value[end])) {
    end++;
  }

  return {
    word: value.slice(start, end),
    start,
    end,
  };
}

interface ExpressionInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  placeholder: string;
  channels: { path: string; name: string }[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  channelFullPaths: Set<string>; // Set of all valid channel full paths for token parsing
}

function ExpressionInput({
  label,
  value,
  onChange,
  onFocus,
  placeholder,
  channels,
  inputRef,
  channelFullPaths,
}: ExpressionInputProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [suggestions, setSuggestions] = useState<{ label: string; display: string; type: 'channel' | 'function'; score: number }[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [wordInfo, setWordInfo] = useState<{ word: string; start: number; end: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // All completable items: channels (full paths only) + numpy functions
  const allItems = useMemo(() => {
    const items: { label: string; display: string; type: 'channel' | 'function' }[] = [];

    // Add channels with full paths only
    channels.forEach(ch => {
      const fullPath = `${ch.path}__${ch.name}`;
      items.push({ label: fullPath, display: `${ch.path}/${ch.name}`, type: 'channel' });
    });

    // Add numpy functions
    NUMPY_FUNCS.forEach(fn => items.push({ label: fn, display: fn, type: 'function' }));
    return items;
  }, [channels]);

  // Parse expression into tokens for chip display
  const tokens = useMemo(() => parseExpressionTokens(value, channelFullPaths), [value, channelFullPaths]);

  // Track if there are channel tokens (used in multiple places)
  const hasChannelTokens = tokens.some(t => t.type === 'channel');

  // Remove a channel from the expression
  const removeChannel = useCallback((channelPath: string) => {
    // Remove the channel and any surrounding whitespace/operators that would leave dangling syntax
    const regex = new RegExp(`\\s*${channelPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'g');
    let newValue = value.replace(regex, ' ').trim();
    // Clean up any double operators or leading/trailing operators
    newValue = newValue.replace(/^\s*[+\-*/]\s*/, '').replace(/\s*[+\-*/]\s*$/, '');
    newValue = newValue.replace(/([+\-*/])\s*([+\-*/])/g, '$1');
    onChange(newValue);
  }, [value, onChange]);

  const updateSuggestions = useCallback((inputValue: string, cursorPos: number) => {
    const info = getWordAtCursor(inputValue, cursorPos);
    setWordInfo(info);

    if (info.word.length < 1) {
      setSuggestions([]);
      setAnchorEl(null);
      return;
    }

    const query = info.word.toLowerCase();

    // Use fuzzy matching with scoring
    const matches = allItems
      .map(item => {
        // Check both label and display for fuzzy match
        const labelScore = fuzzyMatchScore(item.label, query);
        const displayScore = fuzzyMatchScore(item.display, query);
        const score = Math.max(labelScore, displayScore);
        return { ...item, score };
      })
      .filter(item => item.score > 0 && item.label !== info.word)
      .sort((a, b) => b.score - a.score); // Sort by score descending

    if (matches.length > 0) {
      setSuggestions(matches.slice(0, 10));
      setSelectedIndex(0);
      setAnchorEl(containerRef.current);
    } else {
      setSuggestions([]);
      setAnchorEl(null);
    }
  }, [allItems]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    updateSuggestions(newValue, e.target.selectionStart || 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle backspace to delete last channel when input is empty
    if (e.key === 'Backspace' && hasChannelTokens) {
      const input = e.target as HTMLInputElement;
      if (input.value === '' || input.selectionStart === 0) {
        // Find the last channel token and remove it
        const lastChannelToken = [...tokens].reverse().find(t => t.type === 'channel');
        if (lastChannelToken) {
          e.preventDefault();
          removeChannel(lastChannelToken.value);
        }
      }
    }

    if (suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      if (suggestions.length > 0 && wordInfo) {
        e.preventDefault();
        selectSuggestion(suggestions[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setSuggestions([]);
      setAnchorEl(null);
    }
  };

  const selectSuggestion = (item: { label: string; display: string; type: 'channel' | 'function' }) => {
    if (!wordInfo) return;

    const before = value.slice(0, wordInfo.start);
    const after = value.slice(wordInfo.end);
    const insertion = item.type === 'function' && !['pi', 'e'].includes(item.label)
      ? `${item.label}()`
      : item.label;

    const newValue = before + insertion + after;
    onChange(newValue);

    setSuggestions([]);
    setAnchorEl(null);

    setTimeout(() => {
      if (inputRef.current) {
        const newPos = item.type === 'function' && !['pi', 'e'].includes(item.label)
          ? wordInfo.start + item.label.length + 1
          : wordInfo.start + insertion.length;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const handleBlur = () => {
    setTimeout(() => {
      setSuggestions([]);
      setAnchorEl(null);
    }, 150);
  };

  return (
    <Box ref={containerRef}>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
        {label}
      </Typography>

      {/* Chip-based input container */}
      <Box
        onClick={() => inputRef.current?.focus()}
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 0.5,
          p: '6px 10px',
          border: '1px solid',
          borderColor: 'grey.400',
          borderRadius: 1,
          minHeight: 40,
          cursor: 'text',
          bgcolor: 'background.paper',
          '&:hover': {
            borderColor: 'grey.700',
          },
          '&:focus-within': {
            borderColor: 'primary.main',
            outline: '1px solid',
            outlineColor: 'primary.main',
          },
        }}
      >
        {/* Only render tokens when there are channel chips to show */}
        {hasChannelTokens && tokens.map((token, idx) => (
          token.type === 'channel' ? (
            <Chip
              key={`${token.value}-${idx}`}
              label={token.value.replace(/__/g, '/')}
              size="small"
              color="primary"
              onDelete={() => removeChannel(token.value)}
              deleteIcon={<CancelIcon sx={{ fontSize: 14 }} />}
              sx={{
                height: 22,
                fontSize: '0.7rem',
                fontFamily: 'monospace',
                '& .MuiChip-deleteIcon': {
                  fontSize: 14,
                  marginRight: '2px',
                },
              }}
            />
          ) : (
            // Non-empty text tokens (operators, functions, etc)
            token.value.trim() && (
              <Typography
                key={`text-${idx}`}
                component="span"
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  color: 'text.primary',
                  whiteSpace: 'pre',
                }}
              >
                {token.value}
              </Typography>
            )
          )
        ))}

        {/* Inline input for typing new content at the end */}
        <Box
          component="input"
          ref={inputRef}
          value={hasChannelTokens ? '' : value}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            if (hasChannelTokens) {
              // Append typed content to expression
              const newValue = value + e.target.value;
              onChange(newValue);
              updateSuggestions(newValue, newValue.length);
            } else {
              handleChange(e);
            }
          }}
          onFocus={onFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={hasChannelTokens ? '+ add...' : placeholder}
          autoComplete="off"
          sx={{
            flex: 1,
            minWidth: 60,
            border: 'none',
            outline: 'none',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            background: 'transparent',
            p: 0,
            '&::placeholder': {
              color: 'text.disabled',
              opacity: 0.7,
            },
          }}
        />
      </Box>

      {/* Autocomplete dropdown */}
      <Popper
        open={suggestions.length > 0}
        anchorEl={anchorEl}
        placement="bottom-start"
        style={{ zIndex: 1300 }}
      >
        <Paper elevation={3} sx={{ mt: 0.5, maxHeight: 200, overflow: 'auto', minWidth: 250 }}>
          <List dense disablePadding>
            {suggestions.map((item, index) => (
              <ListItemButton
                key={`${item.label}-${index}`}
                selected={index === selectedIndex}
                onClick={() => selectSuggestion(item)}
                sx={{ py: 0.25, px: 1 }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                      >
                        {item.display}
                      </Typography>
                      <Chip
                        label={item.type === 'channel' ? 'ch' : 'fn'}
                        size="small"
                        color={item.type === 'channel' ? 'primary' : 'secondary'}
                        sx={{ height: 16, fontSize: '0.6rem', '& .MuiChip-label': { px: 0.5 } }}
                      />
                    </Box>
                  }
                />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      </Popper>
    </Box>
  );
}

export function ChannelSelector() {
  const {
    h5Channels,
    directViewSettings,
    setDirectViewSettings,
    selectedROI,
    roiConfigs,
    isDirectViewMode,
    saveCurrentAsROI,
  } = useXAS();

  // ROI save state
  const [roiName, setRoiName] = useState('');
  const [roiElement, setRoiElement] = useState<string | null>(null);
  const [energyMin, setEnergyMin] = useState<number | ''>('');
  const [energyMax, setEnergyMax] = useState<number | ''>('');

  // Channel browser expanded state
  const [channelBrowserOpen, setChannelBrowserOpen] = useState(false);

  // Track which input is focused for channel insertion
  const [focusedInput, setFocusedInput] = useState<'x' | 'y' | null>(null);
  const xInputRef = useRef<HTMLInputElement>(null);
  const yInputRef = useRef<HTMLInputElement>(null);

  // Get all channels with their parent paths, sorted by parent
  const allChannels = useMemo(() => {
    if (!h5Channels?.parent_paths || !h5Channels?.channels) return [];
    const channels: { path: string; name: string }[] = [];
    for (const parent of h5Channels.parent_paths.sort()) {
      const parentChannels = h5Channels.channels[parent];
      if (Array.isArray(parentChannels)) {
        for (const ch of parentChannels.sort()) {
          channels.push({ path: parent, name: ch });
        }
      }
    }
    return channels;
  }, [h5Channels]);

  // Set of all valid channel full paths (parent__name format)
  const channelFullPaths = useMemo(() => {
    const paths = new Set<string>();
    allChannels.forEach(ch => {
      paths.add(`${ch.path}__${ch.name}`);
    });
    return paths;
  }, [allChannels]);

  // Current expressions
  const xExpr = directViewSettings?.xExpr || '';
  const yExpr = directViewSettings?.yExpr || '';

  // Show ROI info when ROI is selected
  if (!isDirectViewMode && selectedROI) {
    const roi = roiConfigs.find(r => r.name === selectedROI);
    return (
      <Box>
        <Typography variant="subtitle2" gutterBottom>
          Active ROI: {selectedROI}
        </Typography>
        {roi && (
          <Box sx={{ pl: 1, fontSize: '0.8rem', color: 'text.secondary' }}>
            <Typography variant="body2" color="text.secondary">
              Signal: {roi.numerator}{roi.denominator && ` / ${roi.denominator}`}
            </Typography>
            {roi.element && (
              <Typography variant="body2" color="text.secondary">
                Element: {roi.element}
              </Typography>
            )}
            {(roi.energy_min || roi.energy_max) && (
              <Typography variant="body2" color="text.secondary">
                Energy: {roi.energy_min ?? '...'} - {roi.energy_max ?? '...'} keV
              </Typography>
            )}
          </Box>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Clear ROI selection to use direct channel mode
        </Typography>
      </Box>
    );
  }

  const handleSaveAsROI = async () => {
    if (!roiName || !directViewSettings?.yExpr) return;

    await saveCurrentAsROI(
      roiName,
      roiElement || undefined,
      energyMin === '' ? null : energyMin,
      energyMax === '' ? null : energyMax,
    );

    setRoiName('');
    setRoiElement(null);
    setEnergyMin('');
    setEnergyMax('');
  };

  const handleExprChange = (axis: 'x' | 'y', value: string) => {
    setDirectViewSettings({
      ...directViewSettings!,
      [axis === 'x' ? 'xExpr' : 'yExpr']: value,
    });
  };

  // Insert channel at cursor position in focused input (always uses full path)
  const insertChannel = (path: string, name: string) => {
    const input = focusedInput === 'x' ? xInputRef.current : yInputRef.current;
    const axis = focusedInput || 'y';
    const currentValue = axis === 'x' ? xExpr : yExpr;

    // Always use full path for clarity
    const insertion = `${path}__${name}`;

    if (!input) {
      handleExprChange(axis, currentValue ? `${currentValue} ${insertion}` : insertion);
      return;
    }

    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const newValue = currentValue.slice(0, start) + insertion + currentValue.slice(end);

    handleExprChange(axis, newValue);

    setTimeout(() => {
      input.focus();
      const newPos = start + insertion.length;
      input.setSelectionRange(newPos, newPos);
    }, 0);
  };

  // Check if a specific channel (with full path) is used in either expression
  // Only matches exact full paths (parent__name), not partial channel names
  const isChannelUsed = (parent: string, channelName: string) => {
    const fullPath = `${parent}__${channelName}`;
    // Use word boundary matching to avoid partial matches
    const regex = new RegExp(`(^|[^a-zA-Z0-9_])${fullPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-zA-Z0-9_]|$)`);
    return regex.test(xExpr) || regex.test(yExpr);
  };

  return (
    <Box>
      {/* Header with channel browser toggle */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle2">Channels</Typography>
          {h5Channels && (
            <Typography variant="caption" color="text.secondary">
              {allChannels.length}
            </Typography>
          )}
        </Box>
        {h5Channels && (
          <IconButton
            size="small"
            onClick={() => setChannelBrowserOpen(!channelBrowserOpen)}
            sx={{ p: 0.25 }}
            title={channelBrowserOpen ? 'Hide channels' : 'Browse channels'}
          >
            {channelBrowserOpen ? <CloseIcon fontSize="small" /> : <ListIcon fontSize="small" />}
          </IconButton>
        )}
      </Box>

      {!h5Channels ? (
        <Typography variant="caption" color="text.secondary">
          Select a dataset to load channels
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {/* Collapsible Channel Browser */}
          <Collapse in={channelBrowserOpen}>
            <Box sx={{ bgcolor: 'grey.50', borderRadius: 1, p: 1, mb: 1, maxHeight: 200, overflow: 'auto' }}>
              {h5Channels.parent_paths.sort().map(parent => {
                const parentChannels = h5Channels.channels[parent] || [];
                if (parentChannels.length === 0) return null;
                return (
                  <Box key={parent} sx={{ mb: 1, '&:last-child': { mb: 0 } }}>
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.7rem' }}
                    >
                      {parent}/
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25, mt: 0.25 }}>
                      {parentChannels.sort().map(ch => {
                        const isUsed = isChannelUsed(parent, ch);
                        return (
                          <Chip
                            key={ch}
                            label={ch}
                            size="small"
                            variant={isUsed ? 'filled' : 'outlined'}
                            color={isUsed ? 'primary' : 'default'}
                            onClick={() => insertChannel(parent, ch)}
                            title={`${parent}__${ch}`}
                            sx={{
                              cursor: 'pointer',
                              fontSize: '0.65rem',
                              height: 20,
                              '&:hover': { bgcolor: isUsed ? undefined : 'primary.50' },
                            }}
                          />
                        );
                      })}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Collapse>

          {/* X Expression with autocomplete */}
          <ExpressionInput
            inputRef={xInputRef}
            label="X axis"
            value={xExpr}
            onChange={(v) => handleExprChange('x', v)}
            onFocus={() => setFocusedInput('x')}
            placeholder="energy_enc"
            channels={allChannels}
            channelFullPaths={channelFullPaths}
          />

          {/* Y Expression with autocomplete */}
          <ExpressionInput
            inputRef={yInputRef}
            label="Y axis"
            value={yExpr}
            onChange={(v) => handleExprChange('y', v)}
            onFocus={() => setFocusedInput('y')}
            placeholder="log(Ir_corr / I0)"
            channels={allChannels}
            channelFullPaths={channelFullPaths}
          />

          {/* Hint */}
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
            Tab to autocomplete · Click ✕ to remove channel
          </Typography>

          <Divider />

          {/* Save as ROI */}
          <Typography variant="caption" color="text.secondary">Save as ROI</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Autocomplete
              size="small"
              options={ELEMENTS}
              value={roiElement}
              onChange={(_, value) => setRoiElement(value)}
              renderInput={(params) => (
                <TextField {...params} placeholder="Element" size="small" />
              )}
              sx={{ width: 80 }}
            />
            <TextField
              size="small"
              value={energyMin}
              onChange={(e) => setEnergyMin(e.target.value ? parseFloat(e.target.value) : '')}
              placeholder="E min"
              type="number"
              sx={{ width: 70 }}
              InputProps={{ sx: { fontSize: '0.8rem' } }}
            />
            <TextField
              size="small"
              value={energyMax}
              onChange={(e) => setEnergyMax(e.target.value ? parseFloat(e.target.value) : '')}
              placeholder="E max"
              type="number"
              sx={{ width: 70 }}
              InputProps={{ sx: { fontSize: '0.8rem' } }}
            />
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TextField
              size="small"
              value={roiName}
              onChange={(e) => setRoiName(e.target.value)}
              placeholder="ROI name"
              fullWidth
              InputProps={{ sx: { fontSize: '0.8rem' } }}
            />
            <Button
              size="small"
              variant="contained"
              onClick={handleSaveAsROI}
              disabled={!roiName || !directViewSettings?.yExpr}
              sx={{ minWidth: 'auto', px: 1 }}
            >
              <SaveIcon fontSize="small" />
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}
