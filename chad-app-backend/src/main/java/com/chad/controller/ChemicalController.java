package com.chad.controller;

import com.chad.model.Chemical;
import com.chad.service.ChemicalService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/chemicals")
@CrossOrigin(origins = "*")
public class ChemicalController {

    private final ChemicalService chemicalService;

    public ChemicalController(ChemicalService chemicalService) {
        this.chemicalService = chemicalService;
    }

    // Get chemical properties JSON by chemical name
    @GetMapping("/properties")
    public ResponseEntity<String> getChemicalProperties(@RequestParam String name) {
        return chemicalService.findByName(name)
                .map(chemical -> ResponseEntity.ok().body(chemical.getProperties()))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    // DTO class for save request
    public static class ChemicalDto {
        private String name;
        private Object properties; // Changed from String to Object to avoid JSON parse errors

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public Object getProperties() {
            return properties;
        }

        public void setProperties(Object properties) {
            this.properties = properties;
        }
    }

    // Save or update chemical properties JSON for a chemical name
    @PostMapping("/save")
    public ResponseEntity<Chemical> saveChemicalProperties(@RequestBody ChemicalDto dto) {
        if (dto.getName() == null || dto.getName().isEmpty()) {
            return ResponseEntity.badRequest().build();
        }
        if (dto.getProperties() == null) {
            return ResponseEntity.badRequest().build();
        }
        Chemical saved = chemicalService.saveOrUpdateChemical(dto.getName(), dto.getProperties());
        return ResponseEntity.ok().body(saved);
    }
}
