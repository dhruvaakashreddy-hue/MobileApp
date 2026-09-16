package com.billmate.payments.repository;

import com.billmate.payments.domain.Bill;
import org.springframework.stereotype.Repository;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Where the bills — and crucially their prices — live.
 *
 * <p><strong>This is the security boundary.</strong> The browser never sends an
 * amount; it sends a bill id, and the price is looked up here. If the browser
 * sent the amount, anyone could open devtools and pay ₹1 for a ₹1,840 bill.
 *
 * <p>Swap this for a Spring Data JPA repository and the rest of the app is
 * unchanged — that is the point of putting it behind a class.
 */
@Repository
public class BillRepository {

    private final Map<String, Bill> bills = new LinkedHashMap<>();

    public BillRepository() {
        save(new Bill("electricity", "Electricity bill", "Due in 2 days", 184_000L));
        save(new Bill("broadband", "Broadband", "Due in 4 days", 79_900L));
        save(new Bill("mobile", "Mobile recharge", "Due in 6 days", 29_900L));
    }

    private void save(Bill bill) {
        bills.put(bill.id(), bill);
    }

    public List<Bill> findAll() {
        return List.copyOf(bills.values());
    }

    public Optional<Bill> findById(String id) {
        return Optional.ofNullable(bills.get(id));
    }
}
