//! Pure map coordinate, grid, snapping, and measurement geometry.
//!
//! Public map points are normalized to the image (0..1 on each axis), matching
//! existing pins and party markers. Grid sizes and alignment offsets are image
//! pixels. This module has no transport, renderer, or storage dependencies.

use super::{
    CampaignMap, MapCalibration, MapGrid, MapPoint, HEX_ORIENTATIONS, MAP_GRID_MODES, MAP_UNITS,
};
use serde_json::{json, Value};

const MAX_MEASURE_POINTS: usize = 256;
const CENTER_EPSILON_PIXELS: f64 = 1e-6;
const TIE_EPSILON_SQUARED_PIXELS: f64 = 1e-9;

type CellPair = ((i64, i64), (i64, i64));

#[derive(Debug, Clone, PartialEq)]
pub(super) enum GridCell {
    Square { col: i64, row: i64 },
    Hex { q: i64, r: i64 },
}

impl GridCell {
    pub(super) fn to_json(&self) -> Value {
        match self {
            Self::Square { col, row } => json!({"col": col, "row": row}),
            Self::Hex { q, r } => json!({"q": q, "r": r}),
        }
    }
}

#[derive(Debug, Clone)]
pub(super) struct SnapOutcome {
    pub(super) requested: MapPoint,
    pub(super) effective: MapPoint,
    pub(super) snapped: bool,
    pub(super) cell: Option<GridCell>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum MeasurementMetric {
    Straight,
    SquareEqualDiagonals,
    SquareAlternatingDiagonals,
    HexSteps,
}

impl MeasurementMetric {
    pub(super) fn parse(value: &str) -> Option<Self> {
        match value {
            "straight" => Some(Self::Straight),
            "square-equal-diagonals" => Some(Self::SquareEqualDiagonals),
            "square-alternating-diagonals" => Some(Self::SquareAlternatingDiagonals),
            "hex-steps" => Some(Self::HexSteps),
            _ => None,
        }
    }

    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::Straight => "straight",
            Self::SquareEqualDiagonals => "square-equal-diagonals",
            Self::SquareAlternatingDiagonals => "square-alternating-diagonals",
            Self::HexSteps => "hex-steps",
        }
    }

    fn is_cell_metric(self) -> bool {
        !matches!(self, Self::Straight)
    }
}

#[derive(Debug, Clone)]
pub(super) struct MeasuredSegment {
    pub(super) from: MapPoint,
    pub(super) to: MapPoint,
    pub(super) image_distance: f64,
    pub(super) distance: f64,
    pub(super) from_cell: Option<GridCell>,
    pub(super) to_cell: Option<GridCell>,
    pub(super) diagonal_steps: Option<u64>,
    pub(super) next_diagonal_cost: Option<u8>,
}

#[derive(Debug, Clone)]
pub(super) struct Measurement {
    pub(super) points: Vec<MapPoint>,
    pub(super) segments: Vec<MeasuredSegment>,
    pub(super) image_total: f64,
    pub(super) total: f64,
    pub(super) units: String,
    pub(super) snapped: bool,
    pub(super) calibration: Option<MapCalibration>,
}

pub(super) fn metres_per_unit(units: &str) -> Option<f64> {
    match units {
        "feet" => Some(0.3048),
        "metres" => Some(1.0),
        "miles" => Some(1609.344),
        _ => None,
    }
}

pub(super) fn normalize_grid(mut grid: MapGrid) -> MapGrid {
    grid.mode = grid.mode.trim().into();
    grid.orientation = grid.orientation.trim().into();
    grid
}

pub(super) fn normalize_calibration(mut calibration: MapCalibration) -> MapCalibration {
    calibration.units = calibration.units.trim().into();
    calibration
}

pub(super) fn validate_grid(grid: &MapGrid) -> Result<(), String> {
    if !MAP_GRID_MODES.contains(&grid.mode.as_str()) {
        return Err("Map grid mode must be none, square, or hex.".into());
    }
    if !HEX_ORIENTATIONS.contains(&grid.orientation.as_str()) {
        return Err("Hex grid orientation must be pointy or flat.".into());
    }
    if !grid.size.is_finite() || grid.size <= 0.0 {
        return Err("Map grid size must be a finite positive number of image pixels.".into());
    }
    if !grid.offset_x.is_finite() || !grid.offset_y.is_finite() {
        return Err("Map grid alignment offsets must be finite image pixels.".into());
    }
    Ok(())
}

pub(super) fn validate_calibration(calibration: &MapCalibration) -> Result<(), String> {
    if !MAP_UNITS.contains(&calibration.units.as_str()) {
        return Err("Map scale units must be feet, metres, or miles.".into());
    }
    if !calibration.pixels_per_unit.is_finite() || calibration.pixels_per_unit <= 0.0 {
        return Err("Map scale must be a finite positive number of image pixels per unit.".into());
    }
    Ok(())
}

pub(super) fn validate_point(point: &MapPoint, role: &str) -> Result<(), String> {
    if !point.x.is_finite()
        || !point.y.is_finite()
        || !(0.0..=1.0).contains(&point.x)
        || !(0.0..=1.0).contains(&point.y)
    {
        return Err(format!(
            "{role} must be a finite normalized map position within 0..1 on both axes."
        ));
    }
    Ok(())
}

pub(super) fn calibration_from_points(
    map: &CampaignMap,
    point_a: &MapPoint,
    point_b: &MapPoint,
    known_distance: f64,
    units: &str,
) -> Result<MapCalibration, String> {
    validate_point(point_a, "Calibration point A")?;
    validate_point(point_b, "Calibration point B")?;
    let units = units.trim();
    if !MAP_UNITS.contains(&units) {
        return Err("Map scale units must be feet, metres, or miles.".into());
    }
    if !known_distance.is_finite() || known_distance <= 0.0 {
        return Err("Calibration distance must be a finite positive number.".into());
    }
    let image_distance = image_distance(map, point_a, point_b);
    if !image_distance.is_finite() || image_distance <= 0.0 {
        return Err("Calibration points must be distinct in image space.".into());
    }
    let pixels_per_unit = image_distance / known_distance;
    if !pixels_per_unit.is_finite() || pixels_per_unit <= 0.0 {
        return Err("Calibration produced an invalid map scale.".into());
    }
    Ok(MapCalibration {
        units: units.into(),
        pixels_per_unit,
    })
}

pub(super) fn convert_calibration_units(
    calibration: &MapCalibration,
    units: &str,
) -> Result<MapCalibration, String> {
    validate_calibration(calibration)?;
    let units = units.trim();
    let new_metres =
        metres_per_unit(units).ok_or("Map scale units must be feet, metres, or miles.")?;
    let old_metres = metres_per_unit(&calibration.units)
        .ok_or("The current map scale uses unsupported units.")?;
    let pixels_per_unit = calibration.pixels_per_unit * new_metres / old_metres;
    if !pixels_per_unit.is_finite() || pixels_per_unit <= 0.0 {
        return Err("Changing map units produced an invalid scale.".into());
    }
    Ok(MapCalibration {
        units: units.into(),
        pixels_per_unit,
    })
}

pub(super) fn image_distance(map: &CampaignMap, from: &MapPoint, to: &MapPoint) -> f64 {
    let (from_x, from_y) = image_point(map, from);
    let (to_x, to_y) = image_point(map, to);
    (to_x - from_x).hypot(to_y - from_y)
}

pub(super) fn grid_json(grid: &MapGrid) -> Value {
    let (size_meaning, center_spacing) = match grid.mode.as_str() {
        "square" => ("squareSideLength", json!({"x": grid.size, "y": grid.size})),
        "hex" if grid.orientation == "flat" => (
            "hexCircumradius",
            json!({"x": 1.5 * grid.size, "y": SQRT_3 * grid.size}),
        ),
        "hex" => (
            "hexCircumradius",
            json!({"x": SQRT_3 * grid.size, "y": 1.5 * grid.size}),
        ),
        _ => ("inactive", Value::Null),
    };
    json!({
        "mode": grid.mode,
        "visible": grid.visible,
        "orientation": grid.orientation,
        "size": grid.size,
        "sizeUnit": "imagePixels",
        "sizeMeaning": size_meaning,
        "offset": {"x": grid.offset_x, "y": grid.offset_y},
        "offsetUnit": "imagePixels",
        "offsetMeaning": "centerOfCellZeroZero",
        "centerSpacing": center_spacing,
    })
}

pub(super) fn snap_point(
    map: &CampaignMap,
    requested: &MapPoint,
    snap_enabled: bool,
    role: &str,
) -> Result<SnapOutcome, String> {
    validate_point(requested, role)?;
    validate_grid(&map.grid)?;
    if !snap_enabled || map.grid.mode == "none" {
        return Ok(SnapOutcome {
            requested: requested.clone(),
            effective: requested.clone(),
            snapped: false,
            cell: None,
        });
    }
    let (requested_x, requested_y) = image_point(map, requested);
    let (center_x, center_y, cell) = match map.grid.mode.as_str() {
        "square" => square_snap(&map.grid, requested_x, requested_y),
        "hex" => hex_snap(&map.grid, requested_x, requested_y),
        _ => return Err("Map grid mode is not supported.".into()),
    };
    let effective = normalized_center(map, center_x, center_y)?;
    Ok(SnapOutcome {
        requested: requested.clone(),
        effective,
        snapped: true,
        cell: Some(cell),
    })
}

pub(super) fn measure(
    map: &CampaignMap,
    points: &[MapPoint],
    metric: MeasurementMetric,
    snap_enabled: bool,
) -> Result<Measurement, String> {
    if points.len() < 2 {
        return Err("Measurement needs at least two ordered points.".into());
    }
    if points.len() > MAX_MEASURE_POINTS {
        return Err(format!(
            "Measurement supports at most {MAX_MEASURE_POINTS} ordered points."
        ));
    }
    validate_grid(&map.grid)?;
    if let Some(calibration) = &map.calibration {
        validate_calibration(calibration)?;
    }
    match metric {
        MeasurementMetric::SquareEqualDiagonals | MeasurementMetric::SquareAlternatingDiagonals
            if map.grid.mode != "square" =>
        {
            return Err(format!(
                "Metric {} requires a square grid.",
                metric.as_str()
            ));
        }
        MeasurementMetric::HexSteps if map.grid.mode != "hex" => {
            return Err("Metric hex-steps requires a hex grid.".into());
        }
        _ => {}
    }

    let snap_active = snap_enabled && map.grid.mode != "none";
    let mut effective_points = Vec::with_capacity(points.len());
    let mut cells = Vec::with_capacity(points.len());
    for (index, point) in points.iter().enumerate() {
        let role = format!("Measurement point {}", index + 1);
        let outcome = snap_point(map, point, snap_active, &role)?;
        let cell = if metric.is_cell_metric() {
            if snap_active {
                outcome.cell.clone()
            } else {
                Some(center_cell(map, point, &role)?)
            }
        } else {
            None
        };
        effective_points.push(outcome.effective);
        cells.push(cell);
    }

    let mut segments = Vec::with_capacity(effective_points.len() - 1);
    let mut image_total = 0.0;
    let mut total = 0.0;
    let mut next_diagonal_cost = 1u8;
    for index in 0..effective_points.len() - 1 {
        let from = effective_points[index].clone();
        let to = effective_points[index + 1].clone();
        let image_length = image_distance(map, &from, &to);
        let from_cell = cells[index].clone();
        let to_cell = cells[index + 1].clone();
        let mut diagonal_steps = None;
        let mut next_cost = None;
        let distance = match metric {
            MeasurementMetric::Straight => match &map.calibration {
                Some(calibration) => image_length / calibration.pixels_per_unit,
                None => image_length,
            },
            MeasurementMetric::SquareEqualDiagonals => {
                let (from, to) = square_cells(from_cell.as_ref(), to_cell.as_ref())?;
                let delta_col = i128::from(to.0) - i128::from(from.0);
                let delta_row = i128::from(to.1) - i128::from(from.1);
                delta_col.abs().max(delta_row.abs()) as f64
            }
            MeasurementMetric::SquareAlternatingDiagonals => {
                let (from, to) = square_cells(from_cell.as_ref(), to_cell.as_ref())?;
                let delta_col = (i128::from(to.0) - i128::from(from.0)).abs();
                let delta_row = (i128::from(to.1) - i128::from(from.1)).abs();
                let diagonals = delta_col.min(delta_row);
                let orthogonals = delta_col.max(delta_row) - diagonals;
                let mut diagonal_cost = 0i128;
                for _ in 0..diagonals {
                    diagonal_cost += i128::from(next_diagonal_cost);
                    next_diagonal_cost = if next_diagonal_cost == 1 { 2 } else { 1 };
                }
                diagonal_steps = Some(diagonals as u64);
                next_cost = Some(next_diagonal_cost);
                (orthogonals + diagonal_cost) as f64
            }
            MeasurementMetric::HexSteps => {
                let (from, to) = hex_cells(from_cell.as_ref(), to_cell.as_ref())?;
                let delta_q = i128::from(to.0) - i128::from(from.0);
                let delta_r = i128::from(to.1) - i128::from(from.1);
                ((delta_q.abs() + delta_r.abs() + (delta_q + delta_r).abs()) / 2) as f64
            }
        };
        image_total += image_length;
        total += distance;
        segments.push(MeasuredSegment {
            from,
            to,
            image_distance: image_length,
            distance,
            from_cell,
            to_cell,
            diagonal_steps,
            next_diagonal_cost: next_cost,
        });
    }

    let units = match metric {
        MeasurementMetric::Straight => match &map.calibration {
            Some(calibration) => calibration.units.clone(),
            None => "imagePixels".into(),
        },
        _ => "cells".into(),
    };
    Ok(Measurement {
        points: effective_points,
        segments,
        image_total,
        total,
        units,
        snapped: snap_active,
        calibration: map.calibration.clone(),
    })
}

pub(super) fn image_point(map: &CampaignMap, point: &MapPoint) -> (f64, f64) {
    (
        point.x * f64::from(map.width),
        point.y * f64::from(map.height),
    )
}

fn square_snap(grid: &MapGrid, x: f64, y: f64) -> (f64, f64, GridCell) {
    let relative_x = (x - grid.offset_x) / grid.size;
    let relative_y = (y - grid.offset_y) / grid.size;
    let col = (relative_x + 0.5).floor() as i64;
    let row = (relative_y + 0.5).floor() as i64;
    (
        grid.offset_x + col as f64 * grid.size,
        grid.offset_y + row as f64 * grid.size,
        GridCell::Square { col, row },
    )
}

fn hex_snap(grid: &MapGrid, x: f64, y: f64) -> (f64, f64, GridCell) {
    let relative_x = x - grid.offset_x;
    let relative_y = y - grid.offset_y;
    let (base_q, base_r) = match grid.orientation.as_str() {
        "flat" => (
            relative_x / (1.5 * grid.size),
            relative_y / (SQRT_3 * grid.size) - relative_x / (3.0 * grid.size),
        ),
        _ => (
            relative_x / (SQRT_3 * grid.size) - relative_y / (3.0 * grid.size),
            relative_y / (1.5 * grid.size),
        ),
    };
    let base_q = base_q.floor() as i64;
    let base_r = base_r.floor() as i64;
    let mut best: Option<(i64, i64, f64)> = None;
    for delta_q in -2i64..=2 {
        for delta_r in -2i64..=2 {
            let q = base_q.saturating_add(delta_q);
            let r = base_r.saturating_add(delta_r);
            let (center_x, center_y) = hex_center(grid, q, r);
            let distance_squared = (center_x - x).powi(2) + (center_y - y).powi(2);
            let better = match best {
                None => true,
                Some((best_q, best_r, best_distance_squared)) => {
                    distance_squared < best_distance_squared - TIE_EPSILON_SQUARED_PIXELS
                        || ((distance_squared - best_distance_squared).abs()
                            <= TIE_EPSILON_SQUARED_PIXELS
                            && (q < best_q || (q == best_q && r < best_r)))
                }
            };
            if better {
                best = Some((q, r, distance_squared));
            }
        }
    }
    let Some((q, r, _)) = best else {
        unreachable!("the local hex search always evaluates candidate cells");
    };
    let (center_x, center_y) = hex_center(grid, q, r);
    (center_x, center_y, GridCell::Hex { q, r })
}

fn hex_center(grid: &MapGrid, q: i64, r: i64) -> (f64, f64) {
    let q = q as f64;
    let r = r as f64;
    match grid.orientation.as_str() {
        "flat" => (
            grid.offset_x + 1.5 * grid.size * q,
            grid.offset_y + SQRT_3 * grid.size * (r + q / 2.0),
        ),
        _ => (
            grid.offset_x + SQRT_3 * grid.size * (q + r / 2.0),
            grid.offset_y + 1.5 * grid.size * r,
        ),
    }
}

fn normalized_center(map: &CampaignMap, x: f64, y: f64) -> Result<MapPoint, String> {
    let width = f64::from(map.width);
    let height = f64::from(map.height);
    if !x.is_finite() || !y.is_finite() || x < 0.0 || x > width || y < 0.0 || y > height {
        return Err(
            "Snapped position falls outside the map; adjust the grid offset or use an unsnapped point."
                .into(),
        );
    }
    Ok(MapPoint {
        x: x / width,
        y: y / height,
    })
}

fn center_cell(map: &CampaignMap, point: &MapPoint, role: &str) -> Result<GridCell, String> {
    let outcome = snap_point(map, point, true, role)?;
    let (requested_x, requested_y) = image_point(map, point);
    let (effective_x, effective_y) = image_point(map, &outcome.effective);
    if (effective_x - requested_x).hypot(effective_y - requested_y) > CENTER_EPSILON_PIXELS {
        return Err(format!(
            "{role} must be at a grid cell centre for a cell-based metric, or snapping must be enabled."
        ));
    }
    outcome
        .cell
        .ok_or_else(|| format!("{role} is not on a grid cell centre."))
}

fn square_cells(from: Option<&GridCell>, to: Option<&GridCell>) -> Result<CellPair, String> {
    match (from, to) {
        (
            Some(GridCell::Square {
                col: from_col,
                row: from_row,
            }),
            Some(GridCell::Square {
                col: to_col,
                row: to_row,
            }),
        ) => Ok(((*from_col, *from_row), (*to_col, *to_row))),
        _ => Err("Square-grid metrics need square cell endpoints.".into()),
    }
}

fn hex_cells(from: Option<&GridCell>, to: Option<&GridCell>) -> Result<CellPair, String> {
    match (from, to) {
        (
            Some(GridCell::Hex {
                q: from_q,
                r: from_r,
            }),
            Some(GridCell::Hex { q: to_q, r: to_r }),
        ) => Ok(((*from_q, *from_r), (*to_q, *to_r))),
        _ => Err("Hex metrics need hex cell endpoints.".into()),
    }
}

const SQRT_3: f64 = 1.732_050_807_568_877_2;

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn test_map(width: u32, height: u32, grid: Value, calibration: Value) -> CampaignMap {
        serde_json::from_value(json!({
            "id": "map", "name": "Map", "kind": "Battle",
            "image": {"type": "img", "url": "data:image/png;base64,bWFw"},
            "width": width, "height": height, "locationIds": [], "pins": [],
            "party": null, "calibration": calibration, "grid": grid, "snap": false
        }))
        .unwrap()
    }

    fn point(x: f64, y: f64) -> MapPoint {
        MapPoint { x, y }
    }

    fn cell_point(map: &CampaignMap, x: f64, y: f64) -> MapPoint {
        point(x / f64::from(map.width), y / f64::from(map.height))
    }

    fn hex_point(map: &CampaignMap, q: i64, r: i64) -> MapPoint {
        let (x, y) = hex_center(&map.grid, q, r);
        cell_point(map, x, y)
    }

    fn close(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() < 1e-9,
            "expected {expected}, got {actual}"
        );
    }

    #[test]
    fn coordinate_conversion_accounts_for_non_square_images() {
        let map = test_map(
            1000,
            500,
            json!({"mode": "none"}),
            json!({"units": "feet", "pixelsPerUnit": 10.0}),
        );
        close(
            image_distance(&map, &point(0.0, 0.0), &point(0.1, 0.0)),
            100.0,
        );
        close(
            image_distance(&map, &point(0.0, 0.0), &point(0.0, 0.1)),
            50.0,
        );
        close(
            image_distance(&map, &point(0.1, 0.1), &point(0.0, 0.0)),
            image_distance(&map, &point(0.0, 0.0), &point(0.1, 0.1)),
        );
        let horizontal = measure(
            &map,
            &[point(0.1, 0.5), point(0.35, 0.5)],
            MeasurementMetric::Straight,
            false,
        )
        .unwrap();
        close(horizontal.total, 25.0);
        close(horizontal.image_total, 250.0);
        let vertical = measure(
            &map,
            &[point(0.5, 0.2), point(0.5, 0.4)],
            MeasurementMetric::Straight,
            false,
        )
        .unwrap();
        close(vertical.total, 10.0);
        close(vertical.image_total, 100.0);
    }

    #[test]
    fn square_snap_is_idempotent_and_ties_go_east_and_south() {
        let map = test_map(
            1000,
            500,
            json!({"mode": "square", "visible": false, "size": 100.0,
                "offsetX": 150.0, "offsetY": 100.0, "orientation": "pointy"}),
            Value::Null,
        );
        let outcome = snap_point(&map, &point(0.24, 0.21), true, "Point").unwrap();
        close(outcome.effective.x * 1000.0, 250.0);
        close(outcome.effective.y * 500.0, 100.0);
        assert_eq!(outcome.cell, Some(GridCell::Square { col: 1, row: 0 }));
        let repeated = snap_point(&map, &outcome.effective, true, "Point").unwrap();
        close(repeated.effective.x, outcome.effective.x);
        close(repeated.effective.y, outcome.effective.y);
        assert_eq!(repeated.cell, outcome.cell);

        // x=200 is the shared edge between columns 0 and 1; ties go east.
        let east_tie = snap_point(&map, &cell_point(&map, 200.0, 100.0), true, "Point").unwrap();
        assert_eq!(east_tie.cell, Some(GridCell::Square { col: 1, row: 0 }));
        // y=150 is the shared edge between rows 0 and 1; ties go south.
        let south_tie = snap_point(&map, &cell_point(&map, 150.0, 150.0), true, "Point").unwrap();
        assert_eq!(south_tie.cell, Some(GridCell::Square { col: 0, row: 1 }));

        // A nearest centre outside the image is rejected, not clamped.
        let edge = test_map(
            1000,
            500,
            json!({"mode": "square", "visible": true, "size": 100.0,
                "offsetX": -20.0, "offsetY": 100.0, "orientation": "pointy"}),
            Value::Null,
        );
        assert!(snap_point(&edge, &point(0.0, 0.5), true, "Point").is_err());
    }

    #[test]
    fn hex_snap_resolves_centres_neighbours_and_ties_in_both_orientations() {
        let pointy = test_map(
            1000,
            1000,
            json!({"mode": "hex", "visible": true, "size": 50.0,
                "offsetX": 150.0, "offsetY": 100.0, "orientation": "pointy"}),
            Value::Null,
        );
        let pointy_origin = snap_point(&pointy, &hex_point(&pointy, 0, 0), true, "P").unwrap();
        assert_eq!(pointy_origin.cell, Some(GridCell::Hex { q: 0, r: 0 }));
        close(pointy_origin.effective.x * 1000.0, 150.0);
        let pointy_east = snap_point(&pointy, &hex_point(&pointy, 1, 0), true, "P").unwrap();
        assert_eq!(pointy_east.cell, Some(GridCell::Hex { q: 1, r: 0 }));
        let pointy_south = snap_point(&pointy, &hex_point(&pointy, 0, 1), true, "P").unwrap();
        assert_eq!(pointy_south.cell, Some(GridCell::Hex { q: 0, r: 1 }));
        let (tie_x, tie_y) = hex_center(&pointy.grid, 0, 0);
        let (east_x, _) = hex_center(&pointy.grid, 1, 0);
        let pointy_tie = snap_point(
            &pointy,
            &cell_point(&pointy, (tie_x + east_x) / 2.0, tie_y),
            true,
            "P",
        )
        .unwrap();
        assert_eq!(pointy_tie.cell, Some(GridCell::Hex { q: 0, r: 0 }));

        let flat = test_map(
            1000,
            1000,
            json!({"mode": "hex", "visible": true, "size": 50.0,
                "offsetX": 150.0, "offsetY": 100.0, "orientation": "flat"}),
            Value::Null,
        );
        let flat_east = snap_point(&flat, &hex_point(&flat, 1, 0), true, "P").unwrap();
        assert_eq!(flat_east.cell, Some(GridCell::Hex { q: 1, r: 0 }));
        let flat_south = snap_point(&flat, &hex_point(&flat, 0, 1), true, "P").unwrap();
        assert_eq!(flat_south.cell, Some(GridCell::Hex { q: 0, r: 1 }));
    }

    #[test]
    fn hex_step_metric_matches_known_neighbours() {
        for orientation in ["pointy", "flat"] {
            let map = test_map(
                1000,
                1000,
                json!({"mode": "hex", "visible": false, "size": 50.0,
                    "offsetX": 150.0, "offsetY": 100.0, "orientation": orientation}),
                Value::Null,
            );
            let origin = hex_point(&map, 0, 0);
            let east = hex_point(&map, 1, 0);
            let south = hex_point(&map, 0, 1);
            let neighbour = measure(
                &map,
                &[origin.clone(), east.clone()],
                MeasurementMetric::HexSteps,
                false,
            )
            .unwrap();
            close(neighbour.total, 1.0);
            let path = measure(
                &map,
                &[origin, east, south],
                MeasurementMetric::HexSteps,
                false,
            )
            .unwrap();
            close(path.total, 2.0);
            assert_eq!(path.units, "cells");
        }
    }

    #[test]
    fn square_metrics_handle_diagonals_and_carry_alternating_state() {
        let map = test_map(
            1000,
            1000,
            json!({"mode": "square", "visible": true, "size": 100.0,
                "offsetX": 50.0, "offsetY": 50.0, "orientation": "pointy"}),
            Value::Null,
        );
        let a = cell_point(&map, 50.0, 50.0);
        let b = cell_point(&map, 350.0, 450.0);
        let zero = measure(
            &map,
            &[a.clone(), a.clone()],
            MeasurementMetric::SquareEqualDiagonals,
            false,
        )
        .unwrap();
        close(zero.total, 0.0);
        let equal = measure(
            &map,
            &[a.clone(), b.clone()],
            MeasurementMetric::SquareEqualDiagonals,
            false,
        )
        .unwrap();
        close(equal.total, 4.0);
        let alternating = measure(
            &map,
            &[a.clone(), b.clone()],
            MeasurementMetric::SquareAlternatingDiagonals,
            false,
        )
        .unwrap();
        close(alternating.total, 5.0);

        let diagonal_end = cell_point(&map, 250.0, 250.0);
        let direct = measure(
            &map,
            &[a.clone(), diagonal_end.clone()],
            MeasurementMetric::SquareAlternatingDiagonals,
            false,
        )
        .unwrap();
        let split = measure(
            &map,
            &[a.clone(), cell_point(&map, 150.0, 150.0), diagonal_end],
            MeasurementMetric::SquareAlternatingDiagonals,
            false,
        )
        .unwrap();
        close(direct.total, 3.0);
        close(split.total, 3.0);
        assert_eq!(split.segments[0].next_diagonal_cost, Some(2));
        assert_eq!(split.segments[1].next_diagonal_cost, Some(1));
    }

    #[test]
    fn uncalibrated_measurement_is_image_space_and_zero_segments_are_valid() {
        let map = test_map(1000, 500, json!({"mode": "none"}), Value::Null);
        let result = measure(
            &map,
            &[point(0.1, 0.5), point(0.1, 0.5), point(0.35, 0.5)],
            MeasurementMetric::Straight,
            true,
        )
        .unwrap();
        assert_eq!(result.units, "imagePixels");
        assert!(!result.snapped);
        close(result.total, 250.0);
        close(result.image_total, 250.0);
        assert_eq!(result.segments.len(), 2);
        close(result.segments[0].distance, 0.0);
        close(result.segments[0].image_distance, 0.0);
    }

    #[test]
    fn calibration_and_unit_conversion_preserve_physical_scale() {
        let map = test_map(1000, 500, json!({"mode": "none"}), Value::Null);
        let calibration =
            calibration_from_points(&map, &point(0.1, 0.5), &point(0.2, 0.5), 10.0, "feet")
                .unwrap();
        close(calibration.pixels_per_unit, 10.0);
        let equivalent =
            calibration_from_points(&map, &point(0.1, 0.5), &point(0.3, 0.5), 20.0, "feet")
                .unwrap();
        close(equivalent.pixels_per_unit, 10.0);
        let metres = convert_calibration_units(&calibration, "metres").unwrap();
        close(metres.pixels_per_unit, 32.808_398_950_131_24);
        let miles = convert_calibration_units(&metres, "miles").unwrap();
        close(miles.pixels_per_unit, 52_800.0);
        close(
            convert_calibration_units(&miles, "feet")
                .unwrap()
                .pixels_per_unit,
            10.0,
        );

        let mut calibrated = map.clone();
        calibrated.calibration = Some(calibration);
        let feet = measure(
            &calibrated,
            &[point(0.1, 0.5), point(0.35, 0.5)],
            MeasurementMetric::Straight,
            false,
        )
        .unwrap();
        close(feet.total, 25.0);
        calibrated.calibration = Some(metres);
        let metric = measure(
            &calibrated,
            &[point(0.1, 0.5), point(0.35, 0.5)],
            MeasurementMetric::Straight,
            false,
        )
        .unwrap();
        close(metric.total, 7.62);
        calibrated.calibration = Some(miles);
        let imperial = measure(
            &calibrated,
            &[point(0.1, 0.5), point(0.35, 0.5)],
            MeasurementMetric::Straight,
            false,
        )
        .unwrap();
        close(imperial.total, 25.0 / 5280.0);

        assert!(
            calibration_from_points(&map, &point(0.1, 0.5), &point(0.1, 0.5), 10.0, "feet")
                .is_err()
        );
        assert!(
            calibration_from_points(&map, &point(0.1, 0.5), &point(0.2, 0.5), 0.0, "feet").is_err()
        );
        assert!(
            calibration_from_points(&map, &point(0.1, 0.5), &point(0.2, 0.5), 10.0, "yards")
                .is_err()
        );
    }

    #[test]
    fn measurement_rejects_bad_paths_and_incompatible_metrics() {
        let map = test_map(
            1000,
            500,
            json!({"mode": "square", "visible": false, "size": 100.0,
                "offsetX": 50.0, "offsetY": 50.0, "orientation": "pointy"}),
            Value::Null,
        );
        assert!(measure(&map, &[point(0.1, 0.5)], MeasurementMetric::Straight, false).is_err());
        assert!(measure(
            &map,
            &[point(-0.1, 0.5), point(0.2, 0.5)],
            MeasurementMetric::Straight,
            false
        )
        .is_err());
        let too_many = vec![point(0.5, 0.5); MAX_MEASURE_POINTS + 1];
        assert!(measure(&map, &too_many, MeasurementMetric::Straight, false).is_err());
        // Off-centre endpoints cannot silently become cell steps.
        assert!(measure(
            &map,
            &[point(0.11, 0.51), point(0.25, 0.55)],
            MeasurementMetric::SquareEqualDiagonals,
            false
        )
        .is_err());
        assert!(measure(
            &map,
            &[point(0.05, 0.1), point(0.25, 0.3)],
            MeasurementMetric::HexSteps,
            false
        )
        .is_err());
        let none_map = test_map(1000, 500, json!({"mode": "none"}), Value::Null);
        assert!(measure(
            &none_map,
            &[point(0.1, 0.5), point(0.2, 0.5)],
            MeasurementMetric::SquareEqualDiagonals,
            false
        )
        .is_err());
    }
}
