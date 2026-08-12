#pragma once
#include <vector>
#include <functional>
#include <cmath>
#include <algorithm>
#include <numeric>

// ==========================================================================
// Body-Fitted Grid Generation for LBM External Aerodynamics
// ==========================================================================
// Provides C-grid and O-grid generation with coordinate transformations
// that map body-fitted coordinates to the Cartesian LBM lattice.
//
// C-grid: wraps around airfoils in a C-shape, extends wake downstream
// O-grid: wraps around bluff bodies (cylinders) in circular/oval shape
//
// The LBM solver continues to operate on a uniform Cartesian grid.
// Body-fitted grids provide:
//   1. Exact boundary positions for Bouzidi q computation
//   2. Improved boundary layer resolution for IBM force spreading
//   3. Smooth coordinate metrics for gradient operators
// ==========================================================================

// ------------------------------------------------------------------
// Grid type enumeration
// ------------------------------------------------------------------
enum class GridType { RECTANGLE, C_GRID, O_GRID };

// ------------------------------------------------------------------
// Coordinate mapping function types
// ------------------------------------------------------------------
using CoordMap = std::function<std::pair<double,double>(double,double)>;

// ------------------------------------------------------------------
// BodyFittedGrid: structured curvilinear grid around a body
// ------------------------------------------------------------------
struct BodyFittedGrid {
    GridType type = GridType::RECTANGLE;

    // Grid dimensions in computational space
    int n_xi = 0;
    int n_eta = 0;

    // Coordinate mapping: computational (xi, eta) -> physical (x, y)
    CoordMap to_physical;

    // Inverse mapping: physical (x, y) -> computational (xi, eta)
    // Note: inverse is approximate (Newton iteration), used for q computation
    CoordMap to_computational;

    // Grid point arrays in physical space [n_xi * n_eta]
    std::vector<double> x_phys;
    std::vector<double> y_phys;

    // Pre-computed metric arrays [n_xi * n_eta]
    std::vector<double> J;        // Jacobian determinant = x_xi*y_eta - x_eta*y_xi
    std::vector<double> x_xi;     // dx/dxi
    std::vector<double> x_eta;    // dx/deta
    std::vector<double> y_xi;     // dy/dxi
    std::vector<double> y_eta;    // dy/deta

    // Inverse metric arrays for solving PDEs in computational space
    std::vector<double> xi_x;     // dxi/dx = y_eta / J
    std::vector<double> xi_y;     // dxi/dy = -x_eta / J
    std::vector<double> eta_x;    // deta/dx = -y_xi / J
    std::vector<double> eta_y;    // deta/dy = x_xi / J

    // Body surface points (for q computation)
    std::vector<std::pair<double,double>> body_surface;

    // Index helper
    int idx(int i, int j) const { return j * n_xi + i; }

    // ------------------------------------------------------------------
    // Hyperbolic tangent stretching function
    // Clusters points near s=0 (body) or s=1 (far-field)
    // s_out = (1 + tanh(s_beta*(t - 0.5)) / tanh(0.5*s_beta)) / 2
    // ------------------------------------------------------------------
    static double tanh_stretch(double t, double beta) {
        if (beta < 1e-6) return t;
        return (1.0 + std::tanh(beta * (t - 0.5)) / std::tanh(0.5 * beta)) / 2.0;
    }

    // ------------------------------------------------------------------
    // Power-law stretching: clusters near s=0
    // s_out = t^alpha
    // ------------------------------------------------------------------
    static double power_stretch(double t, double alpha) {
        return std::pow(t, alpha);
    }

    // ------------------------------------------------------------------
    // Compute metric coefficients from grid point positions
    // Uses central differences (one-sided at boundaries)
    // ------------------------------------------------------------------
    void compute_metrics() {
        int ni = n_xi;
        int nj = n_eta;
        int n_total = ni * nj;

        x_xi.resize(n_total, 0.0);
        x_eta.resize(n_total, 0.0);
        y_xi.resize(n_total, 0.0);
        y_eta.resize(n_total, 0.0);
        J.resize(n_total, 0.0);
        xi_x.resize(n_total, 0.0);
        xi_y.resize(n_total, 0.0);
        eta_x.resize(n_total, 0.0);
        eta_y.resize(n_total, 0.0);

        for (int j = 0; j < nj; ++j) {
            for (int i = 0; i < ni; ++i) {
                int k = idx(i, j);

                // d/dxi (central differences)
                if (i == 0) {
                    x_xi[k] = x_phys[idx(i + 1, j)] - x_phys[idx(i, j)];
                    y_xi[k] = y_phys[idx(i + 1, j)] - y_phys[idx(i, j)];
                } else if (i == ni - 1) {
                    x_xi[k] = x_phys[idx(i, j)] - x_phys[idx(i - 1, j)];
                    y_xi[k] = y_phys[idx(i, j)] - y_phys[idx(i - 1, j)];
                } else {
                    x_xi[k] = 0.5 * (x_phys[idx(i + 1, j)] - x_phys[idx(i - 1, j)]);
                    y_xi[k] = 0.5 * (y_phys[idx(i + 1, j)] - y_phys[idx(i - 1, j)]);
                }

                // d/deta (central differences)
                if (j == 0) {
                    x_eta[k] = x_phys[idx(i, j + 1)] - x_phys[idx(i, j)];
                    y_eta[k] = y_phys[idx(i, j + 1)] - y_phys[idx(i, j)];
                } else if (j == nj - 1) {
                    x_eta[k] = x_phys[idx(i, j)] - x_phys[idx(i, j - 1)];
                    y_eta[k] = y_phys[idx(i, j)] - y_phys[idx(i, j - 1)];
                } else {
                    x_eta[k] = 0.5 * (x_phys[idx(i, j + 1)] - x_phys[idx(i, j - 1)]);
                    y_eta[k] = 0.5 * (y_phys[idx(i, j + 1)] - y_phys[idx(i, j - 1)]);
                }

                // Jacobian
                J[k] = x_xi[k] * y_eta[k] - x_eta[k] * y_xi[k];

                // Inverse metrics (only valid where J != 0)
                if (std::abs(J[k]) > 1e-12) {
                    xi_x[k] =  y_eta[k] / J[k];
                    xi_y[k] = -x_eta[k] / J[k];
                    eta_x[k] = -y_xi[k] / J[k];
                    eta_y[k] =  x_xi[k] / J[k];
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // Elliptic smoothing (Thompson grid solver)
    // Solves Laplace equation in computational space to smooth interior
    // Iterates: x_ij = 0.25*(x_{i+1,j} + x_{i-1,j} + x_{i,j+1} + x_{i,j-1})
    // Boundary points are fixed (Dirichlet)
    // ------------------------------------------------------------------
    void elliptic_smooth(int iterations = 100) {
        int ni = n_xi;
        int nj = n_eta;
        std::vector<double> x_new(ni * nj);
        std::vector<double> y_new(ni * nj);

        for (int iter = 0; iter < iterations; ++iter) {
            // Copy boundary points
            for (int i = 0; i < ni; ++i) {
                x_new[idx(i, 0)] = x_phys[idx(i, 0)];
                y_new[idx(i, 0)] = y_phys[idx(i, 0)];
                x_new[idx(i, nj - 1)] = x_phys[idx(i, nj - 1)];
                y_new[idx(i, nj - 1)] = y_phys[idx(i, nj - 1)];
            }
            for (int j = 0; j < nj; ++j) {
                x_new[idx(0, j)] = x_phys[idx(0, j)];
                y_new[idx(0, j)] = y_phys[idx(0, j)];
                x_new[idx(ni - 1, j)] = x_phys[idx(ni - 1, j)];
                y_new[idx(ni - 1, j)] = y_phys[idx(ni - 1, j)];
            }

            // Smooth interior
            for (int j = 1; j < nj - 1; ++j) {
                for (int i = 1; i < ni - 1; ++i) {
                    x_new[idx(i, j)] = 0.25 * (
                        x_phys[idx(i + 1, j)] + x_phys[idx(i - 1, j)]
                        + x_phys[idx(i, j + 1)] + x_phys[idx(i, j - 1)]
                    );
                    y_new[idx(i, j)] = 0.25 * (
                        y_phys[idx(i + 1, j)] + y_phys[idx(i - 1, j)]
                        + y_phys[idx(i, j + 1)] + y_phys[idx(i, j - 1)]
                    );
                }
            }

            std::swap(x_phys, x_new);
            std::swap(y_phys, y_new);
        }
    }

    // ------------------------------------------------------------------
    // Build C-grid around an airfoil
    // airfoil: closed polygon vertices (e.g., from naca_coords)
    // chord: airfoil chord length (lattice units)
    // wake_length: downstream wake extent (lattice units)
    // far_field: distance to outer boundary (lattice units)
    // n_wrap: grid points along the wrap direction (airfoil + wake)
    // n_normal: grid points normal to the airfoil surface
    // aoa_deg: angle of attack in degrees (rotates airfoil)
    // ------------------------------------------------------------------
    void build_c_grid(const std::vector<std::pair<double,double>>& airfoil,
                      double chord, double wake_length, double far_field,
                      int n_wrap, int n_normal, double aoa_deg = 0.0)
    {
        type = GridType::C_GRID;
        n_xi = n_wrap;
        n_eta = n_normal;

        int ni = n_xi;
        int nj = n_eta;
        x_phys.resize(ni * nj, 0.0);
        y_phys.resize(ni * nj, 0.0);

        // Find airfoil extent
        double x_min = 1e30, x_max = -1e30;
        double y_min = 1e30, y_max = -1e30;
        for (const auto& pt : airfoil) {
            x_min = std::min(x_min, pt.first);
            x_max = std::max(x_max, pt.first);
            y_min = std::min(y_min, pt.second);
            y_max = std::max(y_max, pt.second);
        }

        // Airfoil center
        double cx_air = 0.5 * (x_min + x_max);
        double cy_air = 0.5 * (y_min + y_max);

        // Rotate airfoil by AoA
        double aoa_rad = aoa_deg * M_PI / 180.0;
        double cos_a = std::cos(aoa_rad);
        double sin_a = std::sin(aoa_rad);

        // Normalize airfoil to chord length and rotate
        double airfoil_chord = x_max - x_min;
        std::vector<std::pair<double,double>> airfoil_norm(airfoil.size());
        for (size_t k = 0; k < airfoil.size(); ++k) {
            double xn = (airfoil[k].first - cx_air) / airfoil_chord * chord;
            double yn = (airfoil[k].second - cy_air) / airfoil_chord * chord;
            // Rotate by AoA
            airfoil_norm[k] = {
                xn * cos_a - yn * sin_a,
                xn * sin_a + yn * cos_a
            };
        }

        // Place body surface points
        body_surface = airfoil_norm;

        // C-grid topology:
        //   eta = 0: body surface (airfoil + wake)
        //   eta = nj-1: far-field boundary
        //   xi = 0: wake centerline downstream
        //   xi wraps around airfoil from lower TE to upper TE
        //
        // Split airfoil into upper and lower surfaces
        // Upper surface: from LE (max y) to TE trailing edge
        // Lower surface: from LE to TE trailing edge

        // Find leading edge (point with max |y| near x=0)
        int le_idx = 0;
        double max_y_abs = 0.0;
        for (size_t k = 0; k < airfoil_norm.size(); ++k) {
            if (std::abs(airfoil_norm[k].second) > max_y_abs
                || (std::abs(airfoil_norm[k].second) == max_y_abs
                    && std::abs(airfoil_norm[k].first) < std::abs(airfoil_norm[le_idx].first)))
            {
                max_y_abs = std::abs(airfoil_norm[k].second);
                le_idx = static_cast<int>(k);
            }
        }

        // Split into lower (LE index going toward TE lower) and upper (LE going toward TE upper)
        int n_pts = static_cast<int>(airfoil_norm.size());
        std::vector<std::pair<double,double>> lower_half, upper_half;

        // Go from LE clockwise (upper surface first, then lower)
        // Upper: from LE index going forward (toward higher indices)
        for (int k = le_idx; ; k = (k + 1) % n_pts) {
            upper_half.push_back(airfoil_norm[k]);
            if (k == (le_idx - 1 + n_pts) % n_pts) break;
        }

        // Lower: from LE index going backward (toward lower indices)
        for (int k = le_idx; ; k = (k - 1 + n_pts) % n_pts) {
            lower_half.push_back(airfoil_norm[k]);
            if (k == (le_idx + 1) % n_pts) break;
        }

        // Reverse lower so it goes from LE to TE (same direction as upper)
        std::reverse(lower_half.begin(), lower_half.end());

        // C-grid wrap direction: upper TE -> LE -> lower TE -> wake
        // This gives a clockwise path around the airfoil, so that the
        // outward normal (tangent rotated 90 deg CW) points away from the body.
        // Total wrap = upper_half (reversed) + lower_half (skip LE) + wake
        int n_lower = static_cast<int>(lower_half.size());
        int n_upper = static_cast<int>(upper_half.size());
        int n_airfoil = n_lower + n_upper - 1;  // LE shared
        int n_wake = ni - n_airfoil;
        if (n_wake < 2) n_wake = 2;

        // Build the wrap curve (body surface + wake)
        std::vector<std::pair<double,double>> wrap_curve;
        wrap_curve.reserve(ni);

        // Upper surface reversed: upper TE -> LE
        for (int k = n_upper - 1; k >= 0; --k) {
            wrap_curve.push_back(upper_half[k]);
        }
        // Lower surface (skip LE duplicate): LE -> lower TE
        for (int k = 1; k < n_lower; ++k) {
            wrap_curve.push_back(lower_half[k]);
        }
        // Wake extension (straight line downstream from lower TE)
        double te_x = wrap_curve.back().first;
        double te_y = wrap_curve.back().second;
        double wake_dir_x = 1.0;
        double wake_dir_y = 0.0;
        // Align wake with local surface tangent at TE
        if (n_airfoil > 1) {
            double dx_te = wrap_curve[n_airfoil - 1].first - wrap_curve[n_airfoil - 2].first;
            double dy_te = wrap_curve[n_airfoil - 1].second - wrap_curve[n_airfoil - 2].second;
            double len_te = std::sqrt(dx_te * dx_te + dy_te * dy_te);
            if (len_te > 1e-10) {
                wake_dir_x = dx_te / len_te;
                wake_dir_y = dy_te / len_te;
            }
        }

        for (int k = 1; k <= n_wake; ++k) {
            double frac = static_cast<double>(k) / n_wake;
            double w_len = wake_length * frac;
            wrap_curve.push_back({
                te_x + wake_dir_x * w_len,
                te_y + wake_dir_y * w_len
            });
        }

        // Trim or pad wrap_curve to exactly ni points
        while (static_cast<int>(wrap_curve.size()) < ni) {
            wrap_curve.push_back(wrap_curve.back());
        }
        wrap_curve.resize(ni);

        // Generate grid with hyperbolic tangent stretching.
        // eta=0 is body surface, eta=nj-1 is far-field.
        //
        // Normal direction strategy:
        //   - Airfoil portion (i < n_airfoil): perpendicular to local tangent,
        //     pointing away from airfoil center.
        //   - Wake portion (i >= n_airfoil): perpendicular to wake line,
        //     pointing radially outward from wake centerline.
        //   - Blend transition near TE to avoid sharp normal changes.
        double center_x = 0.5 * (x_min + x_max);
        double center_y = 0.5 * (y_min + y_max);

        for (int i = 0; i < ni; ++i) {
            double bx = wrap_curve[i].first;
            double by = wrap_curve[i].second;

            // Compute tangent direction (central differences where possible)
            double tx, ty;
            if (i == 0) {
                tx = wrap_curve[i + 1].first - bx;
                ty = wrap_curve[i + 1].second - by;
            } else if (i == ni - 1) {
                tx = bx - wrap_curve[i - 1].first;
                ty = by - wrap_curve[i - 1].second;
            } else {
                tx = wrap_curve[i + 1].first - wrap_curve[i - 1].first;
                ty = wrap_curve[i + 1].second - wrap_curve[i - 1].second;
            }
            double t_len = std::sqrt(tx * tx + ty * ty);
            if (t_len < 1e-10) { tx = 1.0; ty = 0.0; t_len = 1.0; }
            tx /= t_len;
            ty /= t_len;

            // Perpendicular to tangent (rotate 90 deg clockwise for outward normal)
            double px = ty;
            double py = -tx;

            // Ensure perpendicular points away from airfoil center
            double to_center_x = center_x - bx;
            double to_center_y = center_y - by;
            double dot = px * to_center_x + py * to_center_y;
            if (dot > 0.0) { px = -px; py = -py; }

            // For wake portion, blend toward radially outward from centerline
            double nx, ny;
            if (i >= n_airfoil) {
                // Wake: use perpendicular to tangent, but bias outward
                double rad_x = bx - center_x;
                double rad_y = by - center_y;
                double rad_len = std::sqrt(rad_x * rad_x + rad_y * rad_y);
                if (rad_len > 1e-10) {
                    rad_x /= rad_len;
                    rad_y /= rad_len;
                }
                // Blend: 70% tangent-perp + 30% radial-outward
                double alpha = 0.3;
                nx = (1.0 - alpha) * px + alpha * rad_x;
                ny = (1.0 - alpha) * py + alpha * rad_y;
                double n_len = std::sqrt(nx * nx + ny * ny);
                if (n_len < 1e-10) { nx = px; ny = py; }
                else { nx /= n_len; ny /= n_len; }
            } else {
                nx = px;
                ny = py;
            }

            for (int j = 0; j < nj; ++j) {
                double t = static_cast<double>(j) / (nj - 1);
                // Tanh stretching: cluster near body (t=0)
                double s = tanh_stretch(t, 2.0);
                double dist = far_field * s;
                x_phys[idx(i, j)] = bx + nx * dist;
                y_phys[idx(i, j)] = by + ny * dist;
            }
        }

        // Elliptic smoothing (skip for C-grid: the radially-outward expansion
        // already produces smooth metrics. Laplacian smoothing can break
        // Jacobian near LE/TE where normals from upper/lower surfaces meet.)
        // elliptic_smooth(10);

        // Compute metrics
        compute_metrics();

        // Store TE point for q computation
        body_surface = wrap_curve;

        // Set up coordinate mappings
        to_physical = [this](double xi, double eta)
            -> std::pair<double,double>
        {
            // Bilinear interpolation
            double fi = xi * (n_xi - 1);
            double fj = eta * (n_eta - 1);
            int i0 = std::max(0, std::min(n_xi - 2, static_cast<int>(fi)));
            int j0 = std::max(0, std::min(n_eta - 2, static_cast<int>(fj)));
            double fx = fi - i0;
            double fy = fj - j0;

            double x00 = x_phys[idx(i0, j0)];
            double x10 = x_phys[idx(i0 + 1, j0)];
            double x01 = x_phys[idx(i0, j0 + 1)];
            double x11 = x_phys[idx(i0 + 1, j0 + 1)];
            double y00 = y_phys[idx(i0, j0)];
            double y10 = y_phys[idx(i0 + 1, j0)];
            double y01 = y_phys[idx(i0, j0 + 1)];
            double y11 = y_phys[idx(i0 + 1, j0 + 1)];

            double x = x00 * (1 - fx) * (1 - fy) + x10 * fx * (1 - fy)
                     + x01 * (1 - fx) * fy + x11 * fx * fy;
            double y = y00 * (1 - fx) * (1 - fy) + y10 * fx * (1 - fy)
                     + y01 * (1 - fx) * fy + y11 * fx * fy;
            return {x, y};
        };

        // Inverse mapping via Newton iteration
        to_computational = [this](double x, double y)
            -> std::pair<double,double>
        {
            // Initial guess: uniform
            double xi = 0.5;
            double eta = 0.5;

            for (int iter = 0; iter < 20; ++iter) {
                auto [xp, yp] = to_physical(xi, eta);
                double ex = xp - x;
                double ey = yp - y;

                if (ex * ex + ey * ey < 1e-16) break;

                // Numerical Jacobian
                double dx = 1e-6;
                auto [xp_xi, yp_xi] = to_physical(xi + dx, eta);
                auto [xp_et, yp_et] = to_physical(xi, eta + dx);

                double J_local = (xp_xi - xp) * (yp_et - yp)
                               - (xp_et - xp) * (yp_xi - yp);
                if (std::abs(J_local) < 1e-12) break;

                double dxi = ((yp_et - yp) * ex - (xp_et - xp) * ey) / J_local;
                double deta = (-(yp_xi - yp) * ex + (xp_xi - xp) * ey) / J_local;

                xi += dxi;
                eta += deta;
                xi = std::max(0.0, std::min(1.0, xi));
                eta = std::max(0.0, std::min(1.0, eta));
            }

            return {xi, eta};
        };
    }

    // ------------------------------------------------------------------
    // Build O-grid around a circular cylinder (or any convex shape)
    // cx, cy: body center
    // radius: body radius (lattice units)
    // outer_radius: far-field boundary radius (lattice units)
    // n_circ: grid points around circumference
    // n_radial: grid points from body to far-field
    //
    // Parametrization: xi = theta (counter-clockwise 0..2*pi),
    //   eta = 0 at far-field, eta = 1 at body surface.
    //   This ensures J = x_xi*y_eta - x_eta*y_xi > 0 (positive Jacobian).
    // ------------------------------------------------------------------
    void build_o_grid(double cx_body, double cy_body, double radius,
                      double outer_radius, int n_circ, int n_radial)
    {
        type = GridType::O_GRID;
        n_xi = n_circ;      // circumferential direction
        n_eta = n_radial;   // radial direction

        int ni = n_xi;
        int nj = n_eta;
        x_phys.resize(ni * nj, 0.0);
        y_phys.resize(ni * nj, 0.0);

        // Body surface points
        body_surface.clear();
        body_surface.reserve(ni);

        // Generate O-grid with hyperbolic tan stretching clustered near body.
        // eta = j/(nj-1): j=0 -> far-field (eta=0), j=nj-1 -> body (eta=1).
        // Radial position: r = outer_radius at eta=0, r = radius at eta=1.
        for (int i = 0; i < ni; ++i) {
            double theta = 2.0 * M_PI * static_cast<double>(i) / ni;

            // Radial line direction
            double cos_t = std::cos(theta);
            double sin_t = std::sin(theta);

            for (int j = 0; j < nj; ++j) {
                double t = static_cast<double>(j) / (nj - 1);
                // Tanh stretching: cluster near t=1 (body surface)
                double s = tanh_stretch(t, 3.0);
                // r decreases from outer_radius (eta=0) to radius (eta=1)
                double r = outer_radius + (radius - outer_radius) * s;

                x_phys[idx(i, j)] = cx_body + r * cos_t;
                y_phys[idx(i, j)] = cy_body + r * sin_t;
            }

            body_surface.push_back({cx_body + radius * cos_t,
                                    cy_body + radius * sin_t});
        }

        // Elliptic smoothing to improve orthogonality
        // Scale iterations with grid size (fewer for small grids)
        int smooth_iter = std::min(80, std::max(20, ni / 2));
        elliptic_smooth(smooth_iter);

        // Compute metrics
        compute_metrics();

        // Set up coordinate mappings
        to_physical = [this, cx_body, cy_body, radius, outer_radius]
            (double xi, double eta) -> std::pair<double,double>
        {
            double theta = 2.0 * M_PI * xi;
            double s = tanh_stretch(eta, 3.0);
            double r = outer_radius + (radius - outer_radius) * s;
            return {cx_body + r * std::cos(theta),
                    cy_body + r * std::sin(theta)};
        };

        to_computational = [this, cx_body, cy_body, radius, outer_radius]
            (double x, double y) -> std::pair<double,double>
        {
            double dx = x - cx_body;
            double dy = y - cy_body;
            double r = std::sqrt(dx * dx + dy * dy);
            double theta = std::atan2(dy, dx);
            if (theta < 0.0) theta += 2.0 * M_PI;

            double xi = theta / (2.0 * M_PI);

            // Inverse tanh stretch: s = (r - outer_radius) / (radius - outer_radius)
            double s = (r - outer_radius) / (radius - outer_radius);
            s = std::max(0.0, std::min(1.0, s));

            // Inverse tanh: eta = 0.5 + atanh(2*s - 1) / beta
            double beta = 3.0;
            double val = (2.0 * s - 1.0) * std::tanh(0.5 * beta);
            val = std::max(-1.0 + 1e-10, std::min(1.0 - 1e-10, val));
            double eta = 0.5 + std::atanh(val) / beta;
            eta = std::max(0.0, std::min(1.0, eta));

            return {xi, eta};
        };
    }

    // ------------------------------------------------------------------
    // Map grid to a Cartesian LBM domain
    // Returns an obstacle mask: node is marked solid if it falls inside
    // the body surface (convex hull of body_surface points)
    // ------------------------------------------------------------------
    void map_to_cartesian(int NX, int NY,
                          std::vector<uint8_t>& obstacle,
                          double cell_size = 1.0) const
    {
        int n_nodes = NX * NY;
        obstacle.assign(n_nodes, 0);

        if (body_surface.size() < 3) return;

        // Compute convex hull of body surface for inside test
        // Use ray-casting point-in-polygon test
        for (int y = 0; y < NY; ++y) {
            for (int x = 0; x < NX; ++x) {
                double px = x * cell_size;
                double py = y * cell_size;

                // Ray-casting test against body surface polygon
                bool inside = false;
                int n_poly = static_cast<int>(body_surface.size());
                for (int v = 0; v < n_poly; ++v) {
                    int v2 = (v + 1) % n_poly;
                    double x1 = body_surface[v].first;
                    double y1 = body_surface[v].second;
                    double x2 = body_surface[v2].first;
                    double y2 = body_surface[v2].second;

                    if (((y1 > py) != (y2 > py))
                        && (px < (x2 - x1) * (py - y1) / (y2 - y1) + x1))
                    {
                        inside = !inside;
                    }
                }

                if (inside) {
                    obstacle[y * NX + x] = 1;
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // Compute boundary distance q for Bouzidi interpolation
    // from fluid node (xf, yf) in D2Q9 direction i
    // Uses the body surface polygon for line-segment intersection
    // ------------------------------------------------------------------
    double compute_q(double xf, double yf, int i,
                     int cx_val, int cy_val) const {
        if (body_surface.empty()) return 1.0;

        double ex = static_cast<double>(cx_val);
        double ey = static_cast<double>(cy_val);
        int n = static_cast<int>(body_surface.size());

        double best_t = 1.0;
        for (int v = 0; v < n; ++v) {
            int v2 = (v + 1) % n;
            double x1 = body_surface[v].first;
            double y1 = body_surface[v].second;
            double x2 = body_surface[v2].first;
            double y2 = body_surface[v2].second;

            double dx_e = x2 - x1;
            double dy_e = y2 - y1;
            double denom = ex * dy_e - ey * dx_e;
            if (std::abs(denom) < 1e-15) continue;

            double t = ((x1 - xf) * dy_e - (y1 - yf) * dx_e) / denom;
            double s = ((x1 - xf) * ey - (y1 - yf) * ex) / denom;

            if (t > 0.0 && t <= best_t && s >= 0.0 && s <= 1.0) {
                best_t = t;
            }
        }
        return best_t;
    }

    // ------------------------------------------------------------------
    // Verify grid quality: check Jacobian positivity
    // Returns true if all Jacobians are positive (no negative volumes).
    // For stretched grids (tanh clustering), large Jacobian ratios are expected.
    // ------------------------------------------------------------------
    bool verify_quality() const {
        if (J.empty()) return false;

        int ni = n_xi;
        int nj = n_eta;

        // Check Jacobian positivity (critical: negative volume = invalid grid)
        for (int j = 0; j < nj; ++j) {
            for (int i = 0; i < ni; ++i) {
                if (J[idx(i, j)] <= 0.0) {
                    return false;
                }
            }
        }

        return true;
    }

    // ------------------------------------------------------------------
    // Verify smoothness: check max ratio of adjacent Jacobians.
    // Returns max ratio (1.0 = perfectly uniform, >1 = stretched).
    // For tanh-stretched O-grids, ratios of 10-50 are normal.
    // ------------------------------------------------------------------
    double smoothness_ratio() const {
        if (J.empty()) return 0.0;

        int ni = n_xi;
        int nj = n_eta;
        double max_ratio = 1.0;

        for (int j = 0; j < nj; ++j) {
            for (int i = 0; i < ni - 1; ++i) {
                double a = J[idx(i, j)];
                double b = J[idx(i + 1, j)];
                if (a > 1e-12 && b > 1e-12) {
                    double r = b / a;
                    if (r > max_ratio) max_ratio = r;
                    if (1.0 / r > max_ratio) max_ratio = 1.0 / r;
                }
            }
        }
        for (int j = 0; j < nj - 1; ++j) {
            for (int i = 0; i < ni; ++i) {
                double a = J[idx(i, j)];
                double b = J[idx(i, j + 1)];
                if (a > 1e-12 && b > 1e-12) {
                    double r = b / a;
                    if (r > max_ratio) max_ratio = r;
                    if (1.0 / r > max_ratio) max_ratio = 1.0 / r;
                }
            }
        }

        return max_ratio;
    }

    // ------------------------------------------------------------------
    // Get minimum Jacobian value (for diagnostics)
    // ------------------------------------------------------------------
    double min_jacobian() const {
        if (J.empty()) return 0.0;
        return *std::min_element(J.begin(), J.end());
    }

    // ------------------------------------------------------------------
    // Get maximum Jacobian value (for diagnostics)
    // ------------------------------------------------------------------
    double max_jacobian() const {
        if (J.empty()) return 0.0;
        return *std::max_element(J.begin(), J.end());
    }
};
