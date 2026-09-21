// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title MilestoneEscrow
/// @notice Milestone-based escrow di BSC Testnet. Bukti kerja diverifikasi oleh
///         AI Agent off-chain; AI Agent (role `AI_AGENT_ROLE`) mencairkan dana
///         via `autoRelease` secara otonom. Payer punya fallback `manualApprove`
///         dan `refund`. Recipient bisa `raiseDispute` untuk menghentikan proses.
contract MilestoneEscrow is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum MilestoneStatus {
        Pending,
        Submitted,
        Released,
        Disputed
    }

    struct Milestone {
        uint256 amount;
        string proofRequirement;
        string proofText;
        MilestoneStatus status;
    }

    struct Escrow {
        address payer;
        address recipient;
        address token;
        Milestone[] milestones;
        bool refunded;
    }

    bytes32 public constant AI_AGENT_ROLE = keccak256("AI_AGENT_ROLE");
    uint256 public constant MAX_MILESTONES = 10;

    uint256 public escrowCount;
    mapping(uint256 => Escrow) private _escrows;

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed payer,
        address indexed recipient,
        address token,
        uint256 totalAmount
    );
    event ProofSubmitted(uint256 indexed escrowId, uint256 milestoneIndex, string proofText);
    event MilestoneReleased(
        uint256 indexed escrowId,
        uint256 milestoneIndex,
        address indexed recipient,
        uint256 amount
    );
    event EscrowRefunded(uint256 indexed escrowId, address indexed payer, uint256 amount);
    event MilestoneDisputed(uint256 indexed escrowId, uint256 milestoneIndex);
    event DisputeResolved(uint256 indexed escrowId, uint256 milestoneIndex);

    error ZeroAddress();
    error NoMilestones();
    error TooManyMilestones();
    error ZeroMilestoneAmount();
    error EmptyRequirement();
    error EmptyProof();
    error EscrowNotFound();
    error MilestoneOutOfRange();
    error NotPayer();
    error NotRecipient();
    error NotAuthorized();
    error AlreadyRefunded();
    error InvalidStatus();
    error NothingToRefund();

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice Payer membuat escrow: dana ditarik dari payer dan dikunci di kontrak.
    /// @param recipient Alamat penerima dana.
    /// @param token Alamat ERC20 yang dipakai escrow ini.
    /// @param milestones Daftar milestone; amount harus > 0, maksimal 10.
    function createEscrow(
        address recipient,
        address token,
        Milestone[] calldata milestones
    ) external nonReentrant returns (uint256 escrowId) {
        if (recipient == address(0) || token == address(0)) revert ZeroAddress();

        uint256 n = milestones.length;
        if (n == 0) revert NoMilestones();
        if (n > MAX_MILESTONES) revert TooManyMilestones();

        uint256 total;
        for (uint256 i = 0; i < n; ++i) {
            if (milestones[i].amount == 0) revert ZeroMilestoneAmount();
            if (bytes(milestones[i].proofRequirement).length == 0) revert EmptyRequirement();
            total += milestones[i].amount;
        }

        escrowId = escrowCount;
        Escrow storage e = _escrows[escrowId];
        e.payer = msg.sender;
        e.recipient = recipient;
        e.token = token;
        for (uint256 i = 0; i < n; ++i) {
            e.milestones.push(
                Milestone({
                    amount: milestones[i].amount,
                    proofRequirement: milestones[i].proofRequirement,
                    proofText: "",
                    status: MilestoneStatus.Pending
                })
            );
        }
        escrowCount = escrowId + 1;

        IERC20(token).safeTransferFrom(msg.sender, address(this), total);
        emit EscrowCreated(escrowId, msg.sender, recipient, token, total);
    }

    /// @notice Recipient menyerahkan bukti kerja (teks + link opsional) untuk satu milestone.
    function submitProof(
        uint256 escrowId,
        uint256 milestoneIndex,
        string calldata proofText
    ) external nonReentrant {
        Escrow storage e = _escrowsAt(escrowId);
        if (e.refunded) revert AlreadyRefunded();
        if (msg.sender != e.recipient) revert NotRecipient();
        if (bytes(proofText).length == 0) revert EmptyProof();

        Milestone storage m = _milestoneAt(e, milestoneIndex);
        if (m.status != MilestoneStatus.Pending) revert InvalidStatus();

        m.proofText = proofText;
        m.status = MilestoneStatus.Submitted;
        emit ProofSubmitted(escrowId, milestoneIndex, proofText);
    }

    /// @notice Dipanggil AI Agent (role-gated) untuk mencairkan dana milestone
    ///         yang buktinya sudah diverifikasi off-chain dengan confidence tinggi.
    function autoRelease(
        uint256 escrowId,
        uint256 milestoneIndex
    ) external nonReentrant onlyRole(AI_AGENT_ROLE) {
        Escrow storage e = _escrowsAt(escrowId);
        if (e.refunded) revert AlreadyRefunded();

        Milestone storage m = _milestoneAt(e, milestoneIndex);
        if (m.status != MilestoneStatus.Submitted) revert InvalidStatus();

        m.status = MilestoneStatus.Released;
        uint256 amount = m.amount;
        IERC20(e.token).safeTransfer(e.recipient, amount);
        emit MilestoneReleased(escrowId, milestoneIndex, e.recipient, amount);
    }

    /// @notice Fallback manual oleh payer bila AI confidence rendah.
    function manualApprove(uint256 escrowId, uint256 milestoneIndex) external nonReentrant {
        Escrow storage e = _escrowsAt(escrowId);
        if (msg.sender != e.payer) revert NotPayer();
        if (e.refunded) revert AlreadyRefunded();

        Milestone storage m = _milestoneAt(e, milestoneIndex);
        if (m.status != MilestoneStatus.Submitted) revert InvalidStatus();

        m.status = MilestoneStatus.Released;
        uint256 amount = m.amount;
        IERC20(e.token).safeTransfer(e.recipient, amount);
        emit MilestoneReleased(escrowId, milestoneIndex, e.recipient, amount);
    }

    /// @notice Payer menarik kembali seluruh dana yang belum dicairkan (kapan pun).
    function refund(uint256 escrowId) external nonReentrant {
        Escrow storage e = _escrowsAt(escrowId);
        if (msg.sender != e.payer) revert NotPayer();
        if (e.refunded) revert AlreadyRefunded();

        uint256 n = e.milestones.length;
        uint256 remaining = 0;
        for (uint256 i = 0; i < n; ++i) {
            if (e.milestones[i].status != MilestoneStatus.Released) {
                remaining += e.milestones[i].amount;
            }
        }
        if (remaining == 0) revert NothingToRefund();

        e.refunded = true;
        IERC20(e.token).safeTransfer(msg.sender, remaining);
        emit EscrowRefunded(escrowId, msg.sender, remaining);
    }

    /// @notice Payer ATAU recipient menghentikan proses verifikasi sebuah milestone
    ///         yang sedang Submitted; status jadi Disputed dan tidak bisa dicairkan.
    function raiseDispute(uint256 escrowId, uint256 milestoneIndex) external {
        Escrow storage e = _escrowsAt(escrowId);
        if (msg.sender != e.payer && msg.sender != e.recipient) revert NotAuthorized();
        if (e.refunded) revert AlreadyRefunded();

        Milestone storage m = _milestoneAt(e, milestoneIndex);
        if (m.status != MilestoneStatus.Submitted) revert InvalidStatus();

        m.status = MilestoneStatus.Disputed;
        emit MilestoneDisputed(escrowId, milestoneIndex);
    }

    /// @notice Payer ATAU recipient menyelesaikan sengketa: milestone kembali ke
    ///         Pending sehingga recipient bisa mengirim ulang bukti kerja.
    function resolveDispute(uint256 escrowId, uint256 milestoneIndex) external {
        Escrow storage e = _escrowsAt(escrowId);
        if (msg.sender != e.payer && msg.sender != e.recipient) revert NotAuthorized();
        if (e.refunded) revert AlreadyRefunded();

        Milestone storage m = _milestoneAt(e, milestoneIndex);
        if (m.status != MilestoneStatus.Disputed) revert InvalidStatus();

        m.status = MilestoneStatus.Pending;
        emit DisputeResolved(escrowId, milestoneIndex);
    }

    function getEscrow(
        uint256 escrowId
    )
        external
        view
        returns (address payer, address recipient, address token, uint256 milestoneCount, bool refunded)
    {
        Escrow storage e = _escrowsAt(escrowId);
        payer = e.payer;
        recipient = e.recipient;
        token = e.token;
        milestoneCount = e.milestones.length;
        refunded = e.refunded;
    }

    function getMilestone(
        uint256 escrowId,
        uint256 milestoneIndex
    )
        external
        view
        returns (
            uint256 amount,
            string memory proofRequirement,
            string memory proofText,
            MilestoneStatus status
        )
    {
        Escrow storage e = _escrowsAt(escrowId);
        Milestone storage m = _milestoneAt(e, milestoneIndex);
        amount = m.amount;
        proofRequirement = m.proofRequirement;
        proofText = m.proofText;
        status = m.status;
    }

    function _escrowsAt(uint256 escrowId) private view returns (Escrow storage e) {
        if (escrowId >= escrowCount) revert EscrowNotFound();
        e = _escrows[escrowId];
    }

    function _milestoneAt(
        Escrow storage e,
        uint256 milestoneIndex
    ) private view returns (Milestone storage m) {
        if (milestoneIndex >= e.milestones.length) revert MilestoneOutOfRange();
        m = e.milestones[milestoneIndex];
    }
}