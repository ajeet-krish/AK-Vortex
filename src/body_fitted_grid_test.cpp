#include <gtest/gtest.h>
#include "body_fitted_grid.hpp"
#include "geometry.hpp"
#include <cmath>

// ==========================================================================
// Unit tests for Body-Fitted Grid Generation
// ==========================================================================

// ------------------------------------------------------------------
// O-Grid generation around a cylinder
// ------------------------------------------------------------------
TEST(BodyFittedGridTest, OGridGeneratesValidMesh) {
    BodyFittedGrid grid;
    double cx = 100.0, cy = 50.0, radius = 10.0, outer = 60.0;
    int n_circ = 64, n_rad = 20;

    grid.build_o_grid(cx, cy, radius, outer, n_circ, n_rad);

    EXPECT_EQ(grid.type, GridType::O_GRID);
    EXPECT_EQ(grid.n_xi, n_circ);
    EXPECT_EQ(grid.n_eta, n_rad);

    // All grid points must be finite
    for (int j = 0; j < grid.n_eta; ++j) {
        for (int i = 0; i < grid.n_xi; ++i) {
            int k = grid.idx(i, j);
            EXPECT_FALSE(std::isnan(grid.x_phys[k]));
            EXPECT_FALSE(std::isnan(grid.y_phys[k]));
        }
    }

    // Body surface (j = nj-1) should be near the cylinder surface
    for (int i = 0; i < grid.n_xi; ++i) {
        int j = grid.n_eta - 1;
        double dx = grid.x_phys[grid.idx(i, j)] - cx;
        double dy = grid.y_phys[grid.idx(i, j)] - cy;
        double r = std::sqrt(dx * dx + dy * dy);
        EXPECT_NEAR(r, radius, 0.5);  // within 0.5 lattice units
    }

    // Far-field boundary (j = 0) should be near outer_radius
    for (int i = 0; i < grid.n_xi; ++i) {
        double dx = grid.x_phys[grid.idx(i, 0)] - cx;
        double dy = grid.y_phys[grid.idx(i, 0)] - cy;
        double r = std::sqrt(dx * dx + dy * dy);
        EXPECT_NEAR(r, outer, 1.0);  // within 1.0 lattice units (smoothing)
    }
}

// ------------------------------------------------------------------
// O-Grid Jacobian positivity
// ------------------------------------------------------------------
TEST(BodyFittedGridTest, OGridJacobianPositive) {
    BodyFittedGrid grid;
    grid.build_o_grid(50.0, 50.0, 8.0, 50.0, 48, 16);
    grid.compute_metrics();

    for (int j = 0; j < grid.n_eta; ++j) {
        for (int i = 0; i < grid.n_xi; ++i) {
            EXPECT_GT(grid.J[grid.idx(i, j)], 0.0)
                << "Jacobian non-positive at (" << i << ", " << j << ")";
        }
    }
}

// ------------------------------------------------------------------
// O-Grid coordinate mapping round-trip
// ------------------------------------------------------------------
TEST(BodyFittedGridTest, OGridMappingRoundTrip) {
    BodyFittedGrid grid;
    grid.build_o_grid(100.0, 80.0, 12.0, 80.0, 64, 20);

    // Pick a known point and verify round-trip
    double xi = 0.25, eta = 0.5;
    auto [xp, yp] = grid.to_physical(xi, eta);
    auto [xi2, eta2] = grid.to_computational(xp, yp);

    EXPECT_NEAR(xi2, xi, 0.01);
    EXPECT_NEAR(eta2, eta, 0.01);
}

// ------------------------------------------------------------------
// O-Grid metric consistency
// ------------------------------------------------------------------
TEST(BodyFittedGridTest, OGridMetricConsistency) {
    BodyFittedGrid grid;
    grid.build_o_grid(50.0, 50.0, 10.0, 60.0, 32, 12);

    // Verify J = x_xi * y_eta - x_eta * y_xi at interior points
    for (int j = 1; j < grid.n_eta - 1; ++j) {
        for (int i = 1; i < grid.n_xi - 1; ++i) {
            int k = grid.idx(i, j);
            double J_expected = grid.x_xi[k] * grid.y_eta[k]
                              - grid.x_eta[k] * grid.y_xi[k];
            EXPECT_NEAR(grid.J[k], J_expected, 1e-10)
                << "Jacobian mismatch at (" << i << ", " << j << ")";
        }
    }
}

// ------------------------------------------------------------------
// C-Grid generation around NACA 0012 airfoil
// ------------------------------------------------------------------
TEST(BodyFittedGridTest, CGridGeneratesValidMesh) {
    auto airfoil = naca_coords(12, 100);  // NACA 0012
    BodyFittedGrid grid;
    grid.build_c_grid(airfoil, 40.0, 80.0, 60.0, 80, 24, 5.0);

    EXPECT_EQ(grid.type, GridType::C_GRID);
    EXPECT_EQ(grid.n_xi, 80);
    EXPECT_EQ(grid.n_eta, 24);

    // No NaN or Inf
    for (int j = 0; j < grid.n_eta; ++j) {
        for (int i = 0; i < grid.n_xi; ++i) {
            int k = grid.idx(i, j);
            EXPECT_FALSE(std::isnan(grid.x_phys[k]));
            EXPECT_FALSE(std::isnan(grid.y_phys[k]));
            EXPECT_FALSE(std::isinf(grid.x_phys[k]));
            EXPECT_FALSE(std::isinf(grid.y_phys[k]));
        }
    }
}

// ------------------------------------------------------------------
// C-Grid body surface stored
// ------------------------------------------------------------------
TEST(BodyFittedGridTest, CGridBodySurfaceStored) {
    auto airfoil = naca_coords(12, 100);
    BodyFittedGrid grid;
    grid.build_c_grid(airfoil, 40.0, 80.0, 60.0, 80, 24, 0.0);

    EXPECT_FALSE(grid.body_surface.empty());
    EXPECT_GT(static_cast<int>(grid.body_surface.size()), 10);
}

// ------------------------------------------------------------------
// C-Grid far-field boundary
// ------------------------------------------------------------------
TEST(BodyFittedGridTest, CGridFarFieldBoundary) {
    auto airfoil = naca_coords(12, 100);
    double chord = 40.0, far_field = 60.0;
    BodyFittedGrid grid;
    grid.build_c_grid(airfoil, chord, 80.0, far_field, 80, 24, 0.0);

    // Far-field boundary (eta = nj-1) should be far from origin
    for (int i = 0; i < grid.n_xi; ++i) {
        int j = grid.n_eta - 1;
        double r = std::sqrt(grid.x_phys[grid.idx(i, j)] * grid.x_phys[grid.idx(i, j)]
                           + grid.y_phys[grid.idx(i, j)] * grid.y_phys[grid.idx(i, j)]);
        EXPECT_GT(r, far_field * 0.5);  // at least 50% of far-field distance
    }
}

// ------------------------------------------------------------------
// O-Grid q computation
// ------------------------------------------------------------------
TEST(BodyFittedGridTest, OGridComputeQ) {
    BodyFittedGrid grid;
    grid.build_o_grid(50.0, 50.0, 10.0, 60.0, 32, 16);

    // Point just outside the cylinder (direction 1 = +x, cx=1, cy=0)
    double xf = 52.0, yf = 50.0;
    double q = grid.compute_q(xf, yf, 1, 1, 0);

    // q should be between 0 and 1 (boundary is between fluid and solid)
    EXPECT_GE(q, 0.0);
    EXPECT_LE(q, 1.0);

    // Point far from cylinder: q should be ~1 (no intersection in range)
    double q_far = grid.compute_q(200.0, 50.0, 1, 1, 0);
    EXPECT_NEAR(q_far, 1.0, 0.01);
}

// ------------------------------------------------------------------
// C-Grid q computation (airfoil boundary)
// ------------------------------------------------------------------
TEST(BodyFittedGridTest, CGridComputeQ) {
    auto airfoil = naca_coords(12, 100);
    BodyFittedGrid grid;
    grid.build_c_grid(airfoil, 40.0, 80.0, 60.0, 80, 24, 0.0);

    // Point near the airfoil upper surface (direction 4 = -y, cx=0, cy=-1)
    double xf = 20.0, yf = 3.0;
    double q = grid.compute_q(xf, yf, 4, 0, -1);

    EXPECT_GE(q, 0.0);
    EXPECT_LE(q, 1.0);
}

// ------------------------------------------------------------------
// Grid quality verification
// ------------------------------------------------------------------
TEST(BodyFittedGridTest, OGridQualityVerification) {
    BodyFittedGrid grid;
    grid.build_o_grid(50.0, 50.0, 10.0, 60.0, 48, 20);

    EXPECT_TRUE(grid.verify_quality());
    EXPECT_GT(grid.min_jacobian(), 0.0);
    EXPECT_GT(grid.max_jacobian(), 0.0);
}

// ------------------------------------------------------------------
// Tanh stretching function
// ------------------------------------------------------------------
TEST(BodyFittedGridTest, TanhStretching) {
    // At t=0, s should be 0 (body surface)
    EXPECT_NEAR(BodyFittedGrid::tanh_stretch(0.0, 3.0), 0.0, 1e-10);

    // At t=1, s should be 1 (far-field)
    EXPECT_NEAR(BodyFittedGrid::tanh_stretch(1.0, 3.0), 1.0, 1e-10);

    // At t=0.5, s should be 0.5 (symmetric)
    EXPECT_NEAR(BodyFittedGrid::tanh_stretch(0.5, 3.0), 0.5, 1e-10);

    // Clustering: first 10% of eta should cover less than 10% of distance
    double s_10 = BodyFittedGrid::tanh_stretch(0.1, 3.0);
    EXPECT_LT(s_10, 0.1);
}

// ------------------------------------------------------------------
// Map to Cartesian obstacle mask
// ------------------------------------------------------------------
TEST(BodyFittedGridTest, MapToCartesianObstacleMask) {
    BodyFittedGrid grid;
    grid.build_o_grid(50.0, 50.0, 10.0, 60.0, 32, 16);

    int NX = 120, NY = 100;
    std::vector<uint8_t> obstacle;
    grid.map_to_cartesian(NX, NY, obstacle);

    EXPECT_EQ(static_cast<int>(obstacle.size()), NX * NY);

    // Nodes inside the cylinder should be marked as obstacle
    int nx_count = 0;
    for (int y = 0; y < NY; ++y) {
        for (int x = 0; x < NX; ++x) {
            if (obstacle[y * NX + x]) nx_count++;
        }
    }

    // Approximate cylinder area: pi * r^2 = pi * 100 ~ 314 nodes
    EXPECT_GT(nx_count, 200);
    EXPECT_LT(nx_count, 500);
}

// ------------------------------------------------------------------
// C-Grid elliptic smoothing improves quality
// ------------------------------------------------------------------
TEST(BodyFittedGridTest, EllipticSmoothingImprovesQuality) {
    auto airfoil = naca_coords(12, 80);

    // Build with default smoothing
    BodyFittedGrid grid;
    grid.build_c_grid(airfoil, 30.0, 60.0, 50.0, 60, 16, 0.0);

    // Smoothed grid should have positive Jacobians
    bool all_positive = true;
    for (int j = 0; j < grid.n_eta; ++j) {
        for (int i = 0; i < grid.n_xi; ++i) {
            if (grid.J[grid.idx(i, j)] <= 0.0) {
                all_positive = false;
            }
        }
    }
    EXPECT_TRUE(all_positive);

    // Verify smoothness ratio is reasonable for stretched grid
    double ratio = grid.smoothness_ratio();
    EXPECT_GT(ratio, 1.0);
}

// ------------------------------------------------------------------
// O-Grid with different angular velocities (different n_circ)
// ------------------------------------------------------------------
TEST(BodyFittedGridTest, OGridVaryingResolution) {
    // Low resolution
    BodyFittedGrid grid_low;
    grid_low.build_o_grid(50.0, 50.0, 10.0, 60.0, 16, 8);
    EXPECT_EQ(grid_low.n_xi, 16);
    EXPECT_EQ(grid_low.n_eta, 8);

    // High resolution
    BodyFittedGrid grid_high;
    grid_high.build_o_grid(50.0, 50.0, 10.0, 60.0, 128, 40);
    EXPECT_EQ(grid_high.n_xi, 128);
    EXPECT_EQ(grid_high.n_eta, 40);

    // Both should have positive Jacobians
    EXPECT_TRUE(grid_low.verify_quality());
    EXPECT_TRUE(grid_high.verify_quality());
}
