/** HWDT-18 — frontend tests: employee list rendering, profile page, credential status display. */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { credential, complianceUser, employee, employeeDetail, withAuth } from "./fixtures";

const { push, apiMock } = vi.hoisted(() => ({
  push: vi.fn(),
  apiMock: {
    listEmployees: vi.fn(),
    departments: vi.fn(),
    jobTitles: vi.fn(),
    getEmployee: vi.fn(),
    skills: vi.fn(),
    verifyCredential: vi.fn(),
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/employees",
  useParams: () => ({ id: "e1" }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("../../frontend/src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../frontend/src/lib/api")>();
  return { ...actual, api: apiMock };
});

const { EmployeeList } = await import("../../frontend/src/views/EmployeeListView");
const { EmployeeProfile } = await import("../../frontend/src/views/EmployeeProfileView");
const { CredentialStatusBadge } = await import("../../frontend/src/components/StatusBadge");
const { CredentialTable } = await import("../../frontend/src/components/CredentialTable");

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.departments.mockResolvedValue({ data: [{ id: 1, name: "ICU", description: "", headcount: 3, clinicalCount: 3 }, { id: 10, name: "Administration", description: "", headcount: 2, clinicalCount: 0 }] });
  apiMock.jobTitles.mockResolvedValue({ data: ["Critical Care Nurse", "Ward Clerk"] });
  apiMock.skills.mockResolvedValue({ data: [] });
});

describe("Employee list", () => {
  const page = (data: ReturnType<typeof employee>[]) => ({ data, total: data.length, page: 1, pageSize: 15, totalPages: 1 });

  it("renders employees returned by the API", async () => {
    apiMock.listEmployees.mockResolvedValue(
      page([
        employee(),
        employee({ id: "e2", fullName: "Sara Lindqvist", employeeNumber: "EMP-001019", jobTitle: "Ward Clerk", department: { id: 10, name: "Administration" }, employeeCategory: "NON_CLINICAL", compliance: { status: "NOT_REQUIRED", reasons: [] } }),
      ]),
    );
    render(withAuth(<EmployeeList />));
    const rows = await screen.findAllByTestId("employee-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Amira Haddad")).toBeTruthy();
    expect(within(rows[0]).getByText("ICU")).toBeTruthy();
    expect(within(rows[0]).getByText("Clinical")).toBeTruthy();
    expect(within(rows[1]).getByText("Non Clinical")).toBeTruthy();
    expect(within(rows[1]).getByText("Ward Clerk")).toBeTruthy();
    expect(within(rows[0]).getByTestId("compliance-status").dataset.status).toBe("AT_RISK");
    expect(screen.getByText("2 employees match your filters")).toBeTruthy();
    expect(screen.getByText("+ Add employee")).toBeTruthy(); // HR can create
  });

  it("filters by department, role and category via the API", async () => {
    apiMock.listEmployees.mockResolvedValue(page([employee()]));
    render(withAuth(<EmployeeList />));
    await screen.findAllByTestId("employee-row");
    await waitFor(() => expect(screen.getByLabelText("Filter by department").querySelectorAll("option").length).toBe(3));
    fireEvent.change(screen.getByLabelText("Filter by category"), { target: { value: "CLINICAL" } });
    fireEvent.change(screen.getByLabelText("Filter by department"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Filter by role"), { target: { value: "Critical Care Nurse" } });
    await waitFor(() =>
      expect(apiMock.listEmployees).toHaveBeenLastCalledWith(expect.objectContaining({ category: "CLINICAL", departmentId: "1", jobTitle: "Critical Care Nurse", page: 1 })),
    );
  });

  it("debounces free-text search", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    apiMock.listEmployees.mockResolvedValue(page([]));
    render(withAuth(<EmployeeList />));
    fireEvent.change(screen.getByLabelText("Search employees"), { target: { value: "haddad" } });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    await waitFor(() => expect(apiMock.listEmployees).toHaveBeenLastCalledWith(expect.objectContaining({ search: "haddad" })));
    expect(await screen.findByText("No employees found")).toBeTruthy();
    vi.useRealTimers();
  });
});

describe("Employee profile page", () => {
  it("shows personal information, department, role, skills and credentials", async () => {
    apiMock.getEmployee.mockResolvedValue(employeeDetail());
    render(withAuth(<EmployeeProfile id="e1" />));
    await screen.findByTestId("employee-profile");
    expect(screen.getByRole("heading", { name: "Amira Haddad" })).toBeTruthy();
    expect(screen.getByText("Critical Care Nurse · ICU")).toBeTruthy();
    expect(screen.getByText("NID-784512001")).toBeTruthy();
    expect(screen.getByText("amira.haddad@hwdt.local")).toBeTruthy();
    expect(screen.getAllByTestId("skill-item").map((s) => s.textContent)).toEqual([expect.stringContaining("ACLS"), expect.stringContaining("Ventilator Management")]);
    const rows = screen.getAllByTestId("credential-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByTestId("credential-status").dataset.status).toBe("VALID");
    expect(within(rows[1]).getByTestId("credential-status").dataset.status).toBe("EXPIRING_SOON");
    expect(screen.getByTestId("compliance-status").dataset.status).toBe("AT_RISK");
    expect(apiMock.getEmployee).toHaveBeenCalledWith("e1");
  });

  it("explains that non-clinical staff do not require credentials", async () => {
    apiMock.getEmployee.mockResolvedValue(employeeDetail({ employeeCategory: "NON_CLINICAL", credentials: [], compliance: { status: "NOT_REQUIRED", reasons: [] } }));
    render(withAuth(<EmployeeProfile id="e1" />));
    expect(await screen.findByText("No credentials required")).toBeTruthy();
  });
});

describe("Credential status display", () => {
  it.each([
    ["VALID", "Valid"],
    ["EXPIRING_SOON", "Expiring soon"],
    ["EXPIRED", "Expired"],
    ["PENDING_VERIFICATION", "Pending verification"],
  ] as const)("%s renders as '%s'", (status, label) => {
    render(<CredentialStatusBadge status={status} />);
    const badge = screen.getByTestId("credential-status");
    expect(badge.dataset.status).toBe(status);
    expect(badge.textContent).toContain(label);
  });

  it("flags expired credentials as not valid and hides the Verify action", () => {
    const onVerify = vi.fn();
    render(
      withAuth(
        <CredentialTable
          credentials={[
            credential({ id: "x1", status: "EXPIRED", isValid: false, daysUntilExpiry: -12, expiryDate: "2026-09-12" }),
            credential({ id: "x2", credentialName: "BLS Provider", status: "PENDING_VERIFICATION", isValid: false, verifiedAt: null, verifiedBy: null }),
          ]}
          canVerify
          onVerify={onVerify}
        />,
        complianceUser,
      ),
    );
    const [expiredRow, pendingRow] = screen.getAllByTestId("credential-row");
    expect(within(expiredRow).getByText("Not valid for work")).toBeTruthy();
    expect(within(expiredRow).getByText("Expired 12 days ago")).toBeTruthy();
    expect(within(expiredRow).queryByText("Verify")).toBeNull();
    fireEvent.click(within(pendingRow).getByText("Verify"));
    expect(onVerify).toHaveBeenCalledWith(expect.objectContaining({ id: "x2" }));
  });

  it("shows days remaining for expiring credentials", () => {
    render(<CredentialStatusBadge status="EXPIRING_SOON" days={9} />);
    expect(screen.getByTestId("credential-status").textContent).toContain("9d");
  });
});
